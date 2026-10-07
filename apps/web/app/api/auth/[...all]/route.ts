import { NextResponse } from "next/server";

import { getNeonAuth } from "@/lib/auth";
import { databaseErrorMessage, isDatabaseFailure, isNeonAuthConfigured } from "@/lib/db-config";

type Ctx = { params: Promise<{ all?: string[] }> };

function neonParams(ctx: Ctx) {
  return {
    params: ctx.params.then((value) => ({ path: value.all ?? [] })),
  };
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
    const handler = getNeonAuth().handler();
    return method === "GET"
      ? handler.GET(request, neonParams(ctx))
      : handler.POST(request, neonParams(ctx));
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
