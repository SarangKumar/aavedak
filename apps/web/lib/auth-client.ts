"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/** Same-origin client. Requests go to /api/auth, which proxies Neon Auth. */
export const authClient = createAuthClient();
