import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { rerankUser } from "@/lib/rerank-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The FastAPI call re-scores the open list and tops it up; the helper allows it 60s.
export const maxDuration = 60;

/**
 * Re-run matching for the signed-in user on demand (Settings → Job discovery → Run matching
 * again). The same `ranking.rerank_user` that runs after a career-preference save, a resume
 * change, finishing onboarding, or an admin approval — only ever for the caller's own id.
 */
export async function POST() {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const result = await rerankUser(auth.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ rerank: result });
}
