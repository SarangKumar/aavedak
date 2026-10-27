import { after, NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { ensureAppSchema, getSql } from "@/lib/app-db";
import { rerankUser } from "@/lib/rerank-user";
import { createResumeFromPdf, getResume } from "@/lib/resumes";

/**
 * Persist a resume-creator draft as a real user resume (GCS PDF + resumes row).
 * Origin is marked `creator` so Documents can tell builder saves from uploads.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const form = await request.formData();
  const file = form.get("file");
  const displayNameRaw = form.get("displayName");
  const extractedTextRaw = form.get("extractedText");
  const makeActiveRaw = form.get("makeActive");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "PDF file is required." }, { status: 400 });
  }
  const displayName =
    typeof displayNameRaw === "string" && displayNameRaw.trim()
      ? displayNameRaw.trim()
      : file.name.replace(/\.pdf$/i, "") || "Resume";
  const extractedText =
    typeof extractedTextRaw === "string" && extractedTextRaw.trim().length >= 40
      ? extractedTextRaw.trim()
      : null;

  try {
    const resume = await createResumeFromPdf({
      userId,
      displayName,
      file,
      makeActive: makeActiveRaw === "false" ? false : true,
    });

    await ensureAppSchema();
    const now = new Date().toISOString();
    if (extractedText) {
      await getSql()`
        UPDATE resumes
           SET origin = 'creator', extracted_text = ${extractedText}, updated_at = ${now}
         WHERE id = ${resume.id} AND user_id = ${userId}
      `;
    } else {
      await getSql()`
        UPDATE resumes
           SET origin = 'creator', updated_at = ${now}
         WHERE id = ${resume.id} AND user_id = ${userId}
      `;
    }

    const updated = (await getResume(userId, resume.id)) ?? resume;
    after(() => rerankUser(userId));
    return NextResponse.json(
      {
        resume: {
          id: updated.id,
          displayName: updated.displayName,
          status: updated.status,
          originalFilename: updated.originalFilename,
          byteSize: updated.byteSize,
          atsScore: updated.atsScore,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
