import "server-only";

import { randomUUID } from "node:crypto";

import { getAppDb } from "@/lib/app-db";

export type TemplateKind = "outreach" | "cover" | "other";
export type TemplateStatus = "active" | "archived";

export type TemplateRecord = {
  id: string;
  userId: string;
  title: string;
  /** Email subject line with {{placeholders}}; empty means use default. */
  subject: string;
  body: string;
  kind: TemplateKind;
  status: TemplateStatus;
  createdAt: string;
  updatedAt: string;
};

const KINDS: TemplateKind[] = ["outreach", "cover", "other"];

function mapRow(row: {
  id: string;
  user_id: string;
  title: string;
  subject?: string | null;
  body: string;
  kind: TemplateKind;
  status: TemplateStatus;
  created_at: string;
  updated_at: string;
}): TemplateRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    subject: typeof row.subject === "string" ? row.subject : "",
    body: row.body,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireTitle(title: unknown): string {
  if (typeof title !== "string" || !title.trim()) throw new Error("Title is required.");
  const t = title.trim();
  if (t.length > 200) throw new Error("Title is too long.");
  return t;
}

function parseKind(value: unknown): TemplateKind {
  if (typeof value === "string" && (KINDS as string[]).includes(value)) {
    return value as TemplateKind;
  }
  return "other";
}

export function listTemplates(
  userId: string,
  opts?: { includeArchived?: boolean },
): TemplateRecord[] {
  const includeArchived = opts?.includeArchived ?? false;
  const sql = includeArchived
    ? `SELECT * FROM templates WHERE user_id = ? ORDER BY updated_at DESC`
    : `SELECT * FROM templates WHERE user_id = ? AND status != 'archived' ORDER BY updated_at DESC`;
  const rows = getAppDb().prepare(sql).all(userId) as Array<Parameters<typeof mapRow>[0]>;
  return rows.map(mapRow);
}

export function getTemplate(userId: string, id: string): TemplateRecord | null {
  const row = getAppDb()
    .prepare(`SELECT * FROM templates WHERE id = ? AND user_id = ?`)
    .get(id, userId) as Parameters<typeof mapRow>[0] | undefined;
  return row ? mapRow(row) : null;
}

function optionalSubject(value: unknown): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  if (t.length > 300) throw new Error("Subject is too long.");
  return t;
}

export function createTemplate(
  userId: string,
  input: { title: string; subject?: string; body?: string; kind?: TemplateKind },
): TemplateRecord {
  const title = requireTitle(input.title);
  const subject = optionalSubject(input.subject);
  const body = typeof input.body === "string" ? input.body : "";
  const kind = parseKind(input.kind);
  const id = randomUUID();
  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `INSERT INTO templates
        (id, user_id, title, subject, body, kind, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(id, userId, title, subject, body, kind, now, now);
  return getTemplate(userId, id)!;
}

export function updateTemplate(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    subject: string;
    body: string;
    kind: TemplateKind;
    status: TemplateStatus;
  }>,
): TemplateRecord {
  const existing = getTemplate(userId, id);
  if (!existing) throw new Error("Template not found.");

  const title = patch.title !== undefined ? requireTitle(patch.title) : existing.title;
  const subject = patch.subject !== undefined ? optionalSubject(patch.subject) : existing.subject;
  const body = patch.body !== undefined ? patch.body : existing.body;
  const kind = patch.kind !== undefined ? parseKind(patch.kind) : existing.kind;
  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `UPDATE templates SET title = ?, subject = ?, body = ?, kind = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(title, subject, body, kind, status, now, id, userId);
  return getTemplate(userId, id)!;
}

export function archiveTemplate(userId: string, id: string): TemplateRecord {
  return updateTemplate(userId, id, { status: "archived" });
}

const DEFAULT_OUTREACH_BODY = `Hi {{person_name}},

I hope you are doing well. I am reaching out about the {{role}} role at {{company}} ({{location}}).

Would you be open to a brief chat or a referral if it seems like a fit?

Thank you,
{{user_name}}
`;

/** Ensure at least one outreach template exists for the user (idempotent). */
export function ensureDefaultOutreachTemplate(userId: string): TemplateRecord {
  const existing = listTemplates(userId).find((t) => t.kind === "outreach");
  if (existing) return existing;
  return createTemplate(userId, {
    title: "Cold outreach — referral ask",
    subject: "Referral ask — {{role}} at {{company}}",
    body: DEFAULT_OUTREACH_BODY,
    kind: "outreach",
  });
}
