import { NextResponse } from "next/server";

import {
  applicationToDto,
  createApplication,
  findDuplicateWarnings,
  listApplications,
} from "@/lib/applications";
import { isApplicationStatus } from "@/lib/application-status";
import { requireApiUser } from "@/lib/api-session";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;

  const scopeParam = new URL(request.url).searchParams.get("scope");
  const scope = scopeParam === "archived" ? "archived" : "active";
  const applications = (await listApplications(user.id, scope)).map(applicationToDto);
  return NextResponse.json({ applications });
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;

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
