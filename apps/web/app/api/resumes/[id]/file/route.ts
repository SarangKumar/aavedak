import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { getServerSession } from "@/lib/auth";
import { downloadResumePdf, isGcsObjectKey, toObjectKey } from "@/lib/gcs";
import { ensureProfile } from "@/lib/profile";
import { getResume, getResumeById } from "@/lib/resumes";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await getServerSession();
  const { id } = await ctx.params;

  if (session?.user?.email) {
    await ensureProfile({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    });
    const admin = isAdminEmail(session.user.email);
    const resume = admin ? await getResumeById(id) : await getResume(session.user.id, id);
    if (!resume || (resume.status === "archived" && !admin)) {
      return NextResponse.json({ error: "Resume not found." }, { status: 404 });
    }
    return serveResume(resume);
  }

  // Public: only the active showcase resume is viewable without sign-in.
  const resume = await getResumeById(id);
  if (!resume || resume.status !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return serveResume(resume);
}

async function serveResume(resume: { storagePath: string; originalFilename: string }) {
  if (!isGcsObjectKey(resume.storagePath)) {
    return NextResponse.json(
      {
        error:
          "This resume was stored on a local disk path and is unavailable. Re-upload the PDF (GCS).",
      },
      { status: 404 },
    );
  }

  const key = toObjectKey(resume.storagePath);
  const buffer = await downloadResumePdf(key);
  if (!buffer) {
    return NextResponse.json({ error: "File missing in storage." }, { status: 404 });
  }

  const filename = resume.originalFilename.replace(/[^\w.\- ()]+/g, "_") || "resume.pdf";
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
