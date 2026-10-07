import "server-only";

import { randomUUID } from "node:crypto";

import { getAppDb } from "@/lib/app-db";

export type TemplateKind = "outreach" | "cover" | "other";
export type TemplateStatus = "active" | "archived";

export type TemplateRecord = {
  id: string;
  userId: string;
  title: string;
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

export function createTemplate(
  userId: string,
  input: { title: string; body?: string; kind?: TemplateKind },
): TemplateRecord {
  const title = requireTitle(input.title);
  const body = typeof input.body === "string" ? input.body : "";
  const kind = parseKind(input.kind);
  const id = randomUUID();
  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `INSERT INTO templates
        (id, user_id, title, body, kind, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(id, userId, title, body, kind, now, now);
  return getTemplate(userId, id)!;
}

export function updateTemplate(
  userId: string,
  id: string,
  patch: Partial<{ title: string; body: string; kind: TemplateKind; status: TemplateStatus }>,
): TemplateRecord {
  const existing = getTemplate(userId, id);
  if (!existing) throw new Error("Template not found.");

  const title = patch.title !== undefined ? requireTitle(patch.title) : existing.title;
  const body = patch.body !== undefined ? patch.body : existing.body;
  const kind = patch.kind !== undefined ? parseKind(patch.kind) : existing.kind;
  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  const now = new Date().toISOString();
  getAppDb()
    .prepare(
      `UPDATE templates SET title = ?, body = ?, kind = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(title, body, kind, status, now, id, userId);
  return getTemplate(userId, id)!;
}

export function archiveTemplate(userId: string, id: string): TemplateRecord {
  return updateTemplate(userId, id, { status: "archived" });
}
