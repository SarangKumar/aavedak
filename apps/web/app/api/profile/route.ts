import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import type { CareerProfilePatch } from "@/lib/career-profile";
import {
  getProfile,
  updateCareerProfile,
  updateProfilePublic,
  type ProfilePublicPatch,
} from "@/lib/profile";
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
    career: profile.career,
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

  let body: ProfilePublicPatch & { links?: ProfileLinks; career?: CareerProfilePatch };
  try {
    body = (await request.json()) as ProfilePublicPatch & {
      links?: ProfileLinks;
      career?: CareerProfilePatch;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    let profile = await getProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    const hasPublic =
      body.name !== undefined ||
      body.bio !== undefined ||
      body.portfolioUrl !== undefined ||
      body.linkedinUrl !== undefined ||
      body.links !== undefined;

    if (hasPublic) {
      profile = await updateProfilePublic(user.id, {
        name: body.name,
        bio: body.bio,
        portfolioUrl: body.portfolioUrl,
        linkedinUrl: body.linkedinUrl,
        links: body.links,
      });
    }

    if (body.career !== undefined) {
      profile = await updateCareerProfile(user.id, body.career);
    }

    return NextResponse.json({ profile: serialize(profile) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    const status = message === "Profile not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
