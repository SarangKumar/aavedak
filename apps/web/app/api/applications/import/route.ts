import { NextResponse } from "next/server";

import { parseAndValidateApplicationsImport } from "@/lib/application-import";
import { applicationToDto, importApplications } from "@/lib/applications";
import { requireApiUser } from "@/lib/api-session";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseAndValidateApplicationsImport(body);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: "Validation failed. No applications were imported.",
        errors: parsed.errors,
      },
      { status: 400 },
    );
  }

  const result = await importApplications(user.id, parsed.items);
  return NextResponse.json({
    inserted: result.inserted.map(applicationToDto),
    skippedDuplicates: result.skippedDuplicates,
    insertedCount: result.inserted.length,
    skippedCount: result.skippedDuplicates.length,
  });
}
