import { NextResponse } from "next/server";

import { absoluteApiUrl } from "@/lib/api-url";
import { probeGcsBucket } from "@/lib/gcs";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Status = "ok" | "degraded" | "down" | "not_configured";
type Check = {
  status: Status;
  latencyMs: number | null;
  detail: string | null;
  [k: string]: unknown;
};

const RANK: Record<Status, number> = { ok: 0, not_configured: 0, degraded: 1, down: 2 };

function since(start: number): number {
  return Math.round((performance.now() - start) * 10) / 10;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function gcsCheck(): Promise<Check> {
  const start = performance.now();
  try {
    const r = await withTimeout(probeGcsBucket(), 4000, "GCS");
    if (r.detail === "GCS not configured")
      return { status: "not_configured", latencyMs: null, detail: r.detail };
    return {
      status: r.ok ? "ok" : "down",
      latencyMs: since(start),
      detail: r.detail,
      bucket: r.bucket,
    };
  } catch (err) {
    return { status: "down", latencyMs: since(start), detail: (err as Error).message };
  }
}

async function apiReport(): Promise<{ check: Check; checks: Record<string, Check> }> {
  const start = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(absoluteApiUrl("/svc/health"), {
      cache: "no-store",
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as { checks?: Record<string, Check> } | null;
    if (!body?.checks) {
      return {
        check: {
          status: "down",
          latencyMs: since(start),
          detail: `API returned HTTP ${res.status} without a report`,
        },
        checks: {},
      };
    }
    const { backend, ...rest } = body.checks;
    return {
      check: {
        ...(backend ?? { status: "ok", detail: "FastAPI reachable" }),
        latencyMs: since(start),
        httpStatus: res.status,
      },
      checks: rest,
    };
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    return {
      check: {
        status: "down",
        latencyMs: since(start),
        detail: aborted ? "API timed out after 8000ms" : "API unreachable",
      },
      checks: {},
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Public JSON health of the web app and its dependencies. Never includes secret values. */
export async function GET() {
  const start = performance.now();
  const [api, gcs] = await Promise.all([apiReport(), gcsCheck()]);
  const checks: Record<string, Check> = {
    web: { status: "ok", latencyMs: null, detail: "Next.js route handler responding" },
    backend: api.check,
    ...api.checks,
    gcs,
  };
  let worst = Math.max(...Object.values(checks).map((c) => RANK[c.status] ?? 1));
  if (checks.backend?.status === "down" || checks.database?.status === "down") worst = 2;
  const status: Status = worst === 2 ? "down" : worst === 1 ? "degraded" : "ok";
  return NextResponse.json(
    {
      status,
      version: APP_VERSION,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      timestamp: new Date().toISOString(),
      latencyMs: since(start),
      checks,
    },
    { status: status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
