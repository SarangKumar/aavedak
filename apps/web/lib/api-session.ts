import "server-only";

import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { isUserCapError } from "@/lib/user-cap";

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

/**
 * Session + profile for API routes. Returns null if unauthenticated.
 * Returns a 403 NextResponse if the hard 8-user cap blocks a new account.
 */
export async function requireApiUser(): Promise<
  { user: ApiUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  try {
    await ensureProfile({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    });
  } catch (err) {
    if (isUserCapError(err)) {
      return { error: NextResponse.json({ error: err.message }, { status: 403 }) };
    }
    throw err;
  }
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
  };
}
