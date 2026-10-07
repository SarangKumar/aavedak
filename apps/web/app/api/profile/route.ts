import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { getProfile, updateProfilePublic, type ProfilePublicPatch } from "@/lib/profile";
import type { ProfileLinks } from "@/lib/profile-links";

async function requireUser() {
  const result = await requireApiUser();
  if (result.error) return { error: result.error };
  return { user: result.user };
}

function serialize(profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>) {
  return {
    userId: profile.userId,
    username: profile.username,
    email: profile.email,
    name: profile.name,
    bio: profile.bio,
    portfolioUrl: profile.portfolioUrl,
    linkedinUrl: profile.linkedinUrl,
    links: profile.links,
    imageUrl: profile.imageUrl,
    onboardingComplete: profile.onboardingComplete,
    updatedAt: profile.updatedAt,
  };
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;
  const profile = await getProfile(user.id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
  return NextResponse.json({ profile: serialize(profile) });
}

export async function PATCH(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const user = authResult.user;

  let body: ProfilePublicPatch & { links?: ProfileLinks };
  try {
    body = (await request.json()) as ProfilePublicPatch;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const profile = await updateProfilePublic(user.id, {
      name: body.name,
      bio: body.bio,
      portfolioUrl: body.portfolioUrl,
      linkedinUrl: body.linkedinUrl,
      links: body.links,
    });
    return NextResponse.json({ profile: serialize(profile) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    const status = message === "Profile not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
