import fs from "node:fs";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { getResume, getResumeById } from "@/lib/resumes";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });

  const { id } = await ctx.params;
  const admin = isAdminEmail(session.user.email);
  const resume = admin ? getResumeById(id) : getResume(session.user.id, id);
  if (!resume || (resume.status === "archived" && !admin)) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }
  if (!fs.existsSync(resume.storagePath)) {
    return NextResponse.json({ error: "File missing on disk." }, { status: 404 });
  }

  const buffer = fs.readFileSync(resume.storagePath);
  const filename = resume.originalFilename.replace(/[^\w.\- ()]+/g, "_") || "resume.pdf";
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
