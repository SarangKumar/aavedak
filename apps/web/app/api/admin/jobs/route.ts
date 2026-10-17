import { NextResponse } from "next/server";

import { searchAdminJobs } from "@/lib/admin-jobs";
import { requireApiAdmin } from "@/lib/api-session";

export const dynamic = "force-dynamic";

/** Admin: search all jobs. `?q=&source=&from=yyyy-mm-dd&to=yyyy-mm-dd&page=&pageSize=` */
export async function GET(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  try {
    const data = await searchAdminJobs({
      q: params.get("q") ?? "",
      source: params.get("source") ?? "all",
      postedFrom: params.get("from"),
      postedTo: params.get("to"),
      page: Number(params.get("page") ?? 1) || 1,
      pageSize: Number(params.get("pageSize")) || undefined,
    });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed." },
      { status: 500 },
    );
  }
}
