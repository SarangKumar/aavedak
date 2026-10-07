import { headers } from "next/headers";
import { NextResponse } from "next/server";

import {
  applicationToDto,
  createApplication,
  findDuplicateWarnings,
  listApplications,
} from "@/lib/applications";
import { isApplicationStatus } from "@/lib/application-status";
import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";

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

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scopeParam = new URL(request.url).searchParams.get("scope");
  const scope = scopeParam === "archived" ? "archived" : "active";
  const applications = (await listApplications(user.id, scope)).map(applicationToDto);
  return NextResponse.json({ applications });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const status =
    typeof body.status === "string" && isApplicationStatus(body.status) ? body.status : undefined;

  try {
    const application = await createApplication(user.id, {
      companyName: String(body.companyName ?? ""),
      role: String(body.role ?? ""),
      location: String(body.location ?? ""),
      salaryCtc: (body.salaryCtc as string | null | undefined) ?? null,
      jobLink: (body.jobLink as string | null | undefined) ?? null,
      jobId: (body.jobId as string | null | undefined) ?? null,
      notes: (body.notes as string | null | undefined) ?? null,
      status,
      appliedAt: (body.appliedAt as string | null | undefined) ?? null,
    });
    const duplicates = (
      await findDuplicateWarnings(
        user.id,
        application.companyName,
        application.role,
        application.id,
      )
    ).map(applicationToDto);

    return NextResponse.json(
      {
        application: applicationToDto(application),
        duplicateWarning: duplicates.length > 0,
        duplicates,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
