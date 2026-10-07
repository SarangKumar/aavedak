"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // same-origin; BETTER_AUTH_URL is for the server
});
