import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { setPersonVote, type VoteValue } from "@/lib/people";

type Ctx = { params: Promise<{ id: string }> };

/** Body: `{ vote: 1 | -1 | 0 }` — one vote per user per person; 0 clears it. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  let body: { vote?: unknown };
  try {
    body = (await request.json()) as { vote?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.vote !== 1 && body.vote !== -1 && body.vote !== 0) {
    return NextResponse.json({ error: "vote must be 1, -1, or 0." }, { status: 400 });
  }
  try {
    const votes = await setPersonVote(auth.user.id, id, body.vote as VoteValue);
    return NextResponse.json({ votes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vote failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Person not found." ? 404 : 400 },
    );
  }
}
