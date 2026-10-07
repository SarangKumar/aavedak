import { NextResponse } from "next/server";

import { parseAndValidateApplicationsImport } from "@/lib/application-import";
import { applicationToDto, importApplications } from "@/lib/applications";
import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";

async function requireUser() {
  const { data: session } = await auth.getSession();
  if (!session?.user?.email) return null;
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  return session.user;
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
