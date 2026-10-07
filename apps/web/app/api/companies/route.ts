import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { ensureCompany, listCompanies } from "@/lib/companies";
import { databaseErrorMessage, isDatabaseFailure } from "@/lib/db-config";
import { ensureProfile } from "@/lib/profile";

async function requireUser() {
  const session = await auth.api.getSession();
  if (!session?.user?.email) return null;
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  return session.user;
}

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const companies = await listCompanies(user.id);
    return NextResponse.json({
      companies: companies.map((company) => ({
        id: company.id,
        name: company.name,
      })),
    });
  } catch (err) {
    if (isDatabaseFailure(err)) {
      return NextResponse.json({ error: databaseErrorMessage(err) }, { status: 503 });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const company = await ensureCompany(user.id, String(body?.name ?? ""));
    return NextResponse.json({ company: { id: company.id, name: company.name } }, { status: 201 });
  } catch (err) {
    if (isDatabaseFailure(err)) {
      return NextResponse.json({ error: databaseErrorMessage(err) }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not save company.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
