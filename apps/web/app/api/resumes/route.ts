import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { ResumeStorageError } from "@/lib/resume-storage";
import { createResumeFromPdf, listResumes } from "@/lib/resumes";

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) return null;
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  return session.user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resumes = await listResumes(user.id, { includeArchived: false });
  return NextResponse.json({
    resumes: resumes.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      status: r.status,
      originalFilename: r.originalFilename,
      byteSize: r.byteSize,
      atsScore: r.atsScore,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
          atsScore: resume.atsScore,
          createdAt: resume.createdAt,
          updatedAt: resume.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    const status = err instanceof ResumeStorageError ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
