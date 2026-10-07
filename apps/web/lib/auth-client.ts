"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // same-origin; BETTER_AUTH_URL is for the server
});

/**
 * Sign out via Better Auth, then hard-navigate so App Router RSC/session
 * caches cannot leave a stale signed-in shell.
 */
export async function signOutAndRedirect(redirectTo = "/sign-in") {
  const result = await authClient.signOut();
  if (result?.error) {
    const message =
      typeof result.error === "object" && result.error && "message" in result.error
        ? String((result.error as { message?: string }).message || "Sign out failed")
        : "Sign out failed";
    throw new Error(message);
  }
  window.location.assign(redirectTo);
}
