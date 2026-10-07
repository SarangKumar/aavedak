#!/usr/bin/env node
/** Thin wrapper — runs monorepo scripts/wipe-all-data.mjs */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootScript = resolve(dirname(fileURLToPath(import.meta.url)), "../../../scripts/wipe-all-data.mjs");
const r = spawnSync(process.execPath, [rootScript], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
