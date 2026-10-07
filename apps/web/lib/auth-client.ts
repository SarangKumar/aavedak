"use client";

import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();

/**
 * Sign out via Neon Auth, then hard-navigate so App Router RSC/session
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
