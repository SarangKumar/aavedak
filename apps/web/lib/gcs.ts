import "server-only";

import { Storage, type Bucket } from "@google-cloud/storage";

/**
 * Google Cloud Storage for resume PDFs (required on Vercel — no writable FS).
 *
 * Env (pick one credential style):
 * - GCS_BUCKET (required)
 * - GCS_CLIENT_EMAIL + GCS_PRIVATE_KEY  (preferred on Vercel)
 * - or GCS_CREDENTIALS_JSON (service-account JSON string)
 * - or GOOGLE_APPLICATION_CREDENTIALS (path to JSON file; local only)
 */

let storage: Storage | null = null;
let bucketNameCached: string | null = null;

export function isGcsConfigured(): boolean {
  const bucket = process.env.GCS_BUCKET?.trim();
  if (!bucket) return false;
  if (process.env.GCS_CLIENT_EMAIL?.trim() && process.env.GCS_PRIVATE_KEY?.trim()) return true;
  if (process.env.GCS_CREDENTIALS_JSON?.trim()) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return true;
  return false;
}

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function getStorage(): Storage {
  if (storage) return storage;

  const clientEmail = process.env.GCS_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.GCS_PRIVATE_KEY?.trim();
  const credentialsJson = process.env.GCS_CREDENTIALS_JSON?.trim();

  if (clientEmail && privateKeyRaw) {
    storage = new Storage({
      credentials: {
        client_email: clientEmail,
        private_key: normalizePrivateKey(privateKeyRaw),
      },
    });
    return storage;
  }

  if (credentialsJson) {
    const parsed = JSON.parse(credentialsJson) as {
      client_email?: string;
      private_key?: string;
      project_id?: string;
    };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("GCS_CREDENTIALS_JSON must include client_email and private_key.");
    }
    storage = new Storage({
      projectId: parsed.project_id,
      credentials: {
        client_email: parsed.client_email,
        private_key: normalizePrivateKey(parsed.private_key),
      },
    });
    return storage;
  }

  // ADC / GOOGLE_APPLICATION_CREDENTIALS file path
  storage = new Storage();
  return storage;
}

function getBucketName(): string {
  if (bucketNameCached) return bucketNameCached;
  const name = process.env.GCS_BUCKET?.trim();
  if (!name) {
    throw new Error(
      "GCS_BUCKET is required for resume storage. Set GCS_BUCKET and service-account credentials.",
    );
  }
  bucketNameCached = name;
  return name;
}

function getBucket(): Bucket {
  return getStorage().bucket(getBucketName());
}

/** Object key stored in DB `resumes.storage_path` (not a local filesystem path). */
export function resumeObjectKey(userId: string, resumeId: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `resumes/${safeUser}/${resumeId}.pdf`;
}

export async function uploadResumePdf(
  objectKey: string,
  buffer: Buffer,
  contentType = "application/pdf",
): Promise<void> {
  if (!isGcsConfigured()) {
    throw new Error(
      "Resume storage is not configured. Set GCS_BUCKET and GCS_CLIENT_EMAIL + GCS_PRIVATE_KEY (or GCS_CREDENTIALS_JSON).",
    );
  }
  const file = getBucket().file(objectKey);
  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: "private, max-age=0, no-store",
    },
  });
}

export async function downloadResumePdf(objectKey: string): Promise<Buffer | null> {
  if (!isGcsConfigured()) {
    throw new Error("Resume storage is not configured (GCS).");
  }
  const file = getBucket().file(objectKey);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  return buf;
}

export async function deleteResumePdf(objectKey: string): Promise<void> {
  if (!isGcsConfigured() || !objectKey) return;
  // Skip legacy local absolute paths from pre-GCS rows
  if (objectKey.startsWith("/") || objectKey.includes(":\\")) return;
  try {
    await getBucket().file(objectKey).delete({ ignoreNotFound: true });
  } catch {
    // best-effort cleanup
  }
}

export function isGcsObjectKey(storagePath: string): boolean {
  if (!storagePath) return false;
  if (storagePath.startsWith("/") || /^[A-Za-z]:\\/.test(storagePath)) return false;
  return storagePath.startsWith("resumes/") || storagePath.startsWith("gs://");
}

/** Normalize DB value to a bucket-relative object key. */
export function toObjectKey(storagePath: string): string {
  const trimmed = storagePath.trim();
  if (trimmed.startsWith("gs://")) {
    const without = trimmed.slice("gs://".length);
    const slash = without.indexOf("/");
    if (slash === -1) return without;
    return without.slice(slash + 1);
  }
  return trimmed;
}
