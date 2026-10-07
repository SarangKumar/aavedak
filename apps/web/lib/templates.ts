import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";

export type TemplateKind = "outreach" | "cover" | "other";
export type TemplateStatus = "active" | "archived";

export type TemplateRecord = {
  id: string;
  userId: string;
  title: string;
  subject: string;
  body: string;
  kind: TemplateKind;
  status: TemplateStatus;
  createdAt: string;
  updatedAt: string;
};

const KINDS: TemplateKind[] = ["outreach", "cover", "other"];

type Row = {
  id: string;
  user_id: string;
  title: string;
  subject?: string | null;
  body: string;
  kind: TemplateKind;
  status: TemplateStatus;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): TemplateRecord {
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

function optionalSubject(value: unknown): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  if (t.length > 300) throw new Error("Subject is too long.");
  return t;
}

export async function listTemplates(
  userId: string,
  opts?: { includeArchived?: boolean },
): Promise<TemplateRecord[]> {
  await ensureAppSchema();
  const includeArchived = opts?.includeArchived ?? false;
  const rows = includeArchived
    ? ((await getSql()`
        SELECT * FROM templates WHERE user_id = ${userId} ORDER BY updated_at DESC
      `) as Row[])
    : ((await getSql()`
        SELECT * FROM templates WHERE user_id = ${userId} AND status != 'archived'
        ORDER BY updated_at DESC
      `) as Row[]);
  return rows.map(mapRow);
}

export async function getTemplate(userId: string, id: string): Promise<TemplateRecord | null> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT * FROM templates WHERE id = ${id} AND user_id = ${userId}
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createTemplate(
  userId: string,
  input: { title: string; subject?: string; body?: string; kind?: TemplateKind },
): Promise<TemplateRecord> {
  await ensureAppSchema();
  const title = requireTitle(input.title);
  const subject = optionalSubject(input.subject);
  const body = typeof input.body === "string" ? input.body : "";
  const kind = parseKind(input.kind);
  const id = randomUUID();
  const now = new Date().toISOString();
  await getSql()`
    INSERT INTO templates
      (id, user_id, title, subject, body, kind, status, created_at, updated_at)
    VALUES (${id}, ${userId}, ${title}, ${subject}, ${body}, ${kind}, 'active', ${now}, ${now})
  `;
  const created = await getTemplate(userId, id);
  if (!created) throw new Error("Failed to create template.");
  return created;
}

export async function updateTemplate(
  userId: string,
  id: string,
  patch: Partial<{
    title: string;
    subject: string;
    body: string;
    kind: TemplateKind;
    status: TemplateStatus;
  }>,
): Promise<TemplateRecord> {
  await ensureAppSchema();
  const existing = await getTemplate(userId, id);
  if (!existing) throw new Error("Template not found.");

  const title = patch.title !== undefined ? requireTitle(patch.title) : existing.title;
  const subject = patch.subject !== undefined ? optionalSubject(patch.subject) : existing.subject;
  const body = patch.body !== undefined ? patch.body : existing.body;
  const kind = patch.kind !== undefined ? parseKind(patch.kind) : existing.kind;
  const status = patch.status ?? existing.status;
  if (status !== "active" && status !== "archived") throw new Error("Invalid status.");

  const now = new Date().toISOString();
  await getSql()`
    UPDATE templates
    SET title = ${title}, subject = ${subject}, body = ${body}, kind = ${kind},
        status = ${status}, updated_at = ${now}
    WHERE id = ${id} AND user_id = ${userId}
  `;
  const updated = await getTemplate(userId, id);
  if (!updated) throw new Error("Template not found after update.");
  return updated;
}

export async function archiveTemplate(userId: string, id: string): Promise<TemplateRecord> {
  return updateTemplate(userId, id, { status: "archived" });
}

const DEFAULT_OUTREACH_BODY = `Hi {{person_name}},

I hope you are doing well. I am reaching out about the {{role}} role at {{company}} ({{location}}).

Would you be open to a brief chat or a referral if it seems like a fit?

Thank you,
{{user_name}}
`;

export async function ensureDefaultOutreachTemplate(userId: string): Promise<TemplateRecord> {
  const existing = (await listTemplates(userId)).find((t) => t.kind === "outreach");
  if (existing) return existing;
  return createTemplate(userId, {
    title: "Cold outreach — referral ask",
    subject: "Referral ask — {{role}} at {{company}}",
    body: DEFAULT_OUTREACH_BODY,
    kind: "outreach",
  });
}
