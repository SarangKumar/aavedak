import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { ensureCompany, listCompanies } from "@/lib/companies";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || undefined;
  const companies = await listCompanies({ query: q, limit: 80 });
  return NextResponse.json({
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
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
  try {
    const company = await ensureCompany(String(body.name ?? ""));
    return NextResponse.json(
      {
        company: {
          id: company.id,
          name: company.name,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed." },
      { status: 400 },
    );
  }
}
