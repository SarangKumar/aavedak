import "server-only";

import fs from "node:fs";
import path from "node:path";

import { Storage, type StorageOptions } from "@google-cloud/storage";

/**
 * Resume PDFs live in Google Cloud Storage whenever GCS env is set.
 * Production never creates `.data/resumes` (Vercel’s filesystem is read-only
 * at `/var/task`). Local `next dev` may use `.data/resumes` only when GCS is unset.
 */

const GCS_PREFIX = "gcs://";

export class ResumeStorageError extends Error {
  readonly code = "resume_storage";

  constructor(message: string) {
    super(message);
    this.name = "ResumeStorageError";
  }
}

export function isProductionRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
}

type ServiceAccount = {
  projectId?: string;
  clientEmail: string;
  privateKey: string;
};

function readServiceAccount(): ServiceAccount | null {
  const rawJson = process.env.GCS_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    let parsed: { project_id?: string; client_email?: string; private_key?: string };
    try {
      parsed = JSON.parse(rawJson) as typeof parsed;
    } catch {
      throw new ResumeStorageError(
        "GCS_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the service account key, or set GCS_CLIENT_EMAIL and GCS_PRIVATE_KEY.",
      );
    }
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      projectId: process.env.GCS_PROJECT_ID?.trim() || parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  const clientEmail = process.env.GCS_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GCS_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) return null;
  return {
    projectId: process.env.GCS_PROJECT_ID?.trim() || undefined,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

export function gcsBucketName(): string | null {
  const bucket = process.env.GCS_BUCKET?.trim();
  return bucket || null;
}

export function isGcsConfigured(): boolean {
  return Boolean(gcsBucketName() && readServiceAccount());
}

let storageClient: Storage | null = null;

function gcsClient(): Storage {
  if (!storageClient) {
    const account = readServiceAccount();
    const bucket = gcsBucketName();
    if (!account || !bucket) {
      throw new ResumeStorageError(
        "Google Cloud Storage is not configured. Set GCS_BUCKET, GCS_CLIENT_EMAIL, and GCS_PRIVATE_KEY (or GCS_SERVICE_ACCOUNT_JSON).",
      );
    }
    const options: StorageOptions = {
      projectId: account.projectId,
      credentials: {
        client_email: account.clientEmail,
        private_key: account.privateKey,
      },
    };
    storageClient = new Storage(options);
  }
  return storageClient;
}

export function gcsObjectPath(userId: string, resumeId: string): string {
  const bucket = gcsBucketName();
  if (!bucket) {
    throw new ResumeStorageError("GCS_BUCKET is missing.");
  }
  return `${GCS_PREFIX}${bucket}/resumes/${userId}/${resumeId}.pdf`;
}

function parseGcsPath(storagePath: string): { bucket: string; object: string } | null {
  if (!storagePath.startsWith(GCS_PREFIX)) return null;
  const rest = storagePath.slice(GCS_PREFIX.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), object: rest.slice(slash + 1) };
}

function localResumesRoot(): string {
  return path.join(process.cwd(), ".data", "resumes");
}

function assertLocalDiskAllowed(): void {
  if (isProductionRuntime()) {
    throw new ResumeStorageError(
      "Production resume uploads use Google Cloud Storage. Set GCS_BUCKET, GCS_CLIENT_EMAIL, and GCS_PRIVATE_KEY. The app does not write .data/resumes on Vercel.",
    );
  }
}

export async function saveResumePdf(opts: {
  userId: string;
  resumeId: string;
  bytes: Buffer;
}): Promise<string> {
  if (isGcsConfigured()) {
    const storagePath = gcsObjectPath(opts.userId, opts.resumeId);
    const parsed = parseGcsPath(storagePath);
    if (!parsed) throw new ResumeStorageError("Could not build a GCS object path.");
    await gcsClient()
      .bucket(parsed.bucket)
      .file(parsed.object)
      .save(opts.bytes, {
        resumable: false,
        contentType: "application/pdf",
        metadata: { cacheControl: "private, no-store" },
      });
    return storagePath;
  }

  assertLocalDiskAllowed();
  const userDir = path.join(localResumesRoot(), opts.userId);
  fs.mkdirSync(userDir, { recursive: true });
  const storagePath = path.join(userDir, `${opts.resumeId}.pdf`);
  fs.writeFileSync(storagePath, opts.bytes);
  return storagePath;
}

export async function readResumePdf(storagePath: string): Promise<Buffer | null> {
  const parsed = parseGcsPath(storagePath);
  if (parsed) {
    try {
      const [bytes] = await gcsClient().bucket(parsed.bucket).file(parsed.object).download();
      return bytes;
    } catch (err) {
      const code =
        typeof err === "object" && err && "code" in err
          ? (err as { code?: number }).code
          : undefined;
      if (code === 404) return null;
      const message = err instanceof Error ? err.message : "GCS download failed";
      throw new ResumeStorageError(
        `Could not read the resume from Google Cloud Storage. ${message}`,
      );
    }
  }

  if (isProductionRuntime()) return null;
  if (!storagePath || !fs.existsSync(storagePath)) return null;
  return fs.readFileSync(storagePath);
}

export async function resumeFileExists(storagePath: string): Promise<boolean> {
  const parsed = parseGcsPath(storagePath);
  if (parsed) {
    try {
      const [exists] = await gcsClient().bucket(parsed.bucket).file(parsed.object).exists();
      return exists;
    } catch {
      return false;
    }
  }
  if (isProductionRuntime()) return false;
  return Boolean(storagePath && fs.existsSync(storagePath));
}
