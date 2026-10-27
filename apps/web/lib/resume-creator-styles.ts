import "server-only";

import { randomUUID } from "node:crypto";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { normalizeSections, normalizeStyle } from "@/lib/resume-creator-draft";
import type { ResumeCreatorSectionMeta, ResumeCreatorStyle } from "@/lib/resume-creator-types";

export type SavedResumeStyle = {
  id: string;
  name: string;
  description: string;
  style: ResumeCreatorStyle;
  /** Section order + visibility captured with the config (optional for older rows). */
  sections?: ResumeCreatorSectionMeta[];
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  name: string;
  description: string | null;
  style_json: string;
  created_at: string;
  updated_at: string;
};

type StoredPayload = {
  style: ResumeCreatorStyle;
  sections?: ResumeCreatorSectionMeta[];
};

function parseStored(raw: string): StoredPayload {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "style" in (parsed as object)
  ) {
    const obj = parsed as Record<string, unknown>;
    return {
      style: normalizeStyle(obj.style),
      sections: obj.sections !== undefined ? normalizeSections(obj.sections) : undefined,
    };
  }
  // Legacy rows: style fields at the top level.
  return { style: normalizeStyle(parsed) };
}

function mapRow(row: Row): SavedResumeStyle {
  const stored = parseStored(row.style_json);
  return {
    id: row.id,
    name: row.name,
    description: (row.description ?? "").slice(0, 100),
    style: stored.style,
    sections: stored.sections,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listResumeCreatorStyles(userId: string): Promise<SavedResumeStyle[]> {
  await ensureAppSchema();
  const rows = (await getSql()`
    SELECT id, name, description, style_json, created_at, updated_at
      FROM resume_creator_styles
     WHERE user_id = ${userId}
     ORDER BY updated_at DESC
  `) as Row[];
  return rows.map(mapRow);
}

export async function createResumeCreatorStyle(opts: {
  userId: string;
  name: string;
  description?: string;
  style: ResumeCreatorStyle;
  sections?: ResumeCreatorSectionMeta[];
}): Promise<SavedResumeStyle> {
  await ensureAppSchema();
  const name = opts.name.trim().slice(0, 80);
  if (!name) throw new Error("Name is required.");
  const description = (opts.description ?? "").trim().slice(0, 100);
  const style = normalizeStyle(opts.style);
  const sections = opts.sections ? normalizeSections(opts.sections) : undefined;
  const payload: StoredPayload = sections ? { style, sections } : { style };
  const id = randomUUID();
  const now = new Date().toISOString();
  await getSql()`
    INSERT INTO resume_creator_styles (id, user_id, name, description, style_json, created_at, updated_at)
    VALUES (${id}, ${opts.userId}, ${name}, ${description}, ${JSON.stringify(payload)}, ${now}, ${now})
  `;
  return { id, name, description, style, sections, createdAt: now, updatedAt: now };
}

export async function deleteResumeCreatorStyle(userId: string, id: string): Promise<void> {
  await ensureAppSchema();
  await getSql()`
    DELETE FROM resume_creator_styles WHERE id = ${id} AND user_id = ${userId}
  `;
}
