import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { listPeopleForJob } from "@/lib/people";

type Ctx = { params: Promise<{ id: string }> };

/** People at this job's company, ordered by referral relevance, then community votes. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const people = await listPeopleForJob(auth.user.id, id);
  return NextResponse.json({
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      roleTitle: p.roleTitle,
      company: p.company,
      email: p.email,
      linkedin: p.linkedin ? `https://www.${p.linkedin}` : null,
      origin: p.origin,
      relevanceScore: p.relevanceScore,
      relevanceReason: p.relevanceReason,
      votes: p.votes,
    })),
  });
}
