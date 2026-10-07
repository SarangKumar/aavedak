import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { createResumeFromPdf, listResumes } from "@/lib/resumes";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const resumes = await listResumes(user.id, { includeArchived: false });
  return NextResponse.json({
    resumes: resumes.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      status: r.status,
      originalFilename: r.originalFilename,
      byteSize: r.byteSize,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;

  const form = await request.formData();
  const file = form.get("file");
  const displayNameRaw = form.get("displayName");
  const makeActiveRaw = form.get("makeActive");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "PDF file is required." }, { status: 400 });
  }
  const displayName =
    typeof displayNameRaw === "string" && displayNameRaw.trim()
      ? displayNameRaw.trim()
      : file.name.replace(/\.pdf$/i, "") || "Resume";

  try {
    const resume = await createResumeFromPdf({
      userId: user.id,
      displayName,
      file,
      makeActive: makeActiveRaw === "false" ? false : true,
    });
    return NextResponse.json(
      {
        resume: {
          id: resume.id,
          displayName: resume.displayName,
          status: resume.status,
          originalFilename: resume.originalFilename,
          byteSize: resume.byteSize,
          createdAt: resume.createdAt,
          updatedAt: resume.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
