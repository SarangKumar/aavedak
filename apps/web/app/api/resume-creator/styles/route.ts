import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { normalizeSections, normalizeStyle } from "@/lib/resume-creator-draft";
import { createResumeCreatorStyle, listResumeCreatorStyles } from "@/lib/resume-creator-styles";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const styles = await listResumeCreatorStyles(auth.user.id);
  return NextResponse.json({ styles });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  const description = typeof body.description === "string" ? body.description : "";
  try {
    const style = await createResumeCreatorStyle({
      userId: auth.user.id,
      name,
      description,
      style: normalizeStyle(body.style),
      sections: body.sections !== undefined ? normalizeSections(body.sections) : undefined,
    });
    return NextResponse.json({ style }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed." },
      { status: 400 },
    );
  }
}
