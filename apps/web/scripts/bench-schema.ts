/**
 * Time a cold `ensureAppSchema()` (fresh process) plus one trivial query, against DATABASE_URL.
 * Run: node --env-file=../../.env --conditions=react-server --import tsx scripts/bench-schema.ts
 */
import { ensureAppSchema, getSql } from "@/lib/app-db";

async function main() {
  const t0 = performance.now();
  await getSql()`SELECT 1`;
  const t1 = performance.now();
  await ensureAppSchema();
  const t2 = performance.now();
  console.log(
    `round trip ${(t1 - t0).toFixed(0)} ms · ensureAppSchema (cold) ${(t2 - t1).toFixed(0)} ms`,
  );
}

void main();
