import { NextResponse } from "next/server";

import { getNeonAuth } from "@/lib/auth";
import { databaseErrorMessage, isDatabaseFailure, isNeonAuthConfigured } from "@/lib/db-config";
import {
  isGoogleAccountAllowed,
  revokeOverCapAccount,
  SIGNUP_CLOSED_MESSAGE,
  signupCapReached,
  userIdFromSessionSetCookie,
} from "@/lib/signup-cap";

type Ctx = { params: Promise<{ all?: string[] }> };

function neonParams(ctx: Ctx) {
  return {
    params: ctx.params.then((value) => ({ path: value.all ?? [] })),
  };
}

function joinedPath(path: string[]): string {
  return path.join("/");
}

async function rejectClosedSignup(request: Request, setCookies: string[]): Promise<NextResponse> {
  const blocked = NextResponse.redirect(new URL("/sign-in?closed=1", request.url));
  blocked.cookies.set("aavedak_signup_closed", "1", { path: "/", maxAge: 180, sameSite: "lax" });
  for (const line of setCookies) {
    const name = line.split("=")[0]?.trim();
    if (name) blocked.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return blocked;
}

/** After Neon creates a session, drop any Google account outside the first 8. */
async function enforceSignupCap(request: Request, response: Response): Promise<Response> {
  const setCookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const sessionLine = setCookies.find(
    (line) => /session_token=/i.test(line) && !/max-age=0/i.test(line),
  );
  if (!sessionLine) return response;

  const userId = await userIdFromSessionSetCookie(sessionLine);
  if (!userId || (await isGoogleAccountAllowed(userId))) return response;

  await revokeOverCapAccount(userId);
  return rejectClosedSignup(request, setCookies);
}

async function handle(method: "GET" | "POST", request: Request, ctx: Ctx) {
  try {
    if (!isNeonAuthConfigured()) {
      return NextResponse.json(
        {
          error:
            "Neon Auth is not configured. Set NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL, and NEON_AUTH_COOKIE_SECRET.",
          code: "database_config",
        },
        { status: 503 },
      );
    }

    const path = (await ctx.params).all ?? [];
    const route = joinedPath(path);
    if (route.includes("sign-up") && (await signupCapReached())) {
      return NextResponse.json(
        { error: SIGNUP_CLOSED_MESSAGE, code: "signup_closed" },
        { status: 403 },
      );
    }

    const handler = getNeonAuth().handler();
    const response =
      method === "GET"
        ? await handler.GET(request, neonParams(ctx))
        : await handler.POST(request, neonParams(ctx));

    if (route.includes("callback")) {
      return enforceSignupCap(request, response);
    }
    return response;
  } catch (err) {
    if (isDatabaseFailure(err)) {
      return NextResponse.json(
        { error: databaseErrorMessage(err), code: "database_config" },
        { status: 503 },
      );
    }
    throw err;
  }
}

export function GET(request: Request, ctx: Ctx) {
  return handle("GET", request, ctx);
}

export function POST(request: Request, ctx: Ctx) {
  return handle("POST", request, ctx);
}
