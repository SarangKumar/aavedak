import { NextResponse } from "next/server";

import { APPLICATION_IMPORT_SAMPLE, APPLICATION_IMPORT_SCHEMA } from "@/lib/application-import";
import { APPLICATION_STATUSES } from "@/lib/application-status";

const APPLICATION_IMPORT_HUMAN = `Arambh applications import schema
=================================

Root: either
  • an array of application objects, or
  • { "applications": [ ... ] }

Each application object
-----------------------
Required:
  company_name  string (min 1, max 200)
  role          string (min 1, max 200)
  location      string (min 1, max 200)
  status        one of: ${APPLICATION_STATUSES.join(", ")}

Optional:
  salary_ctc    string | null (max 200)
  job_link      string | null (http(s) URL, max 2000)
  job_id        string | null (max 200)
  notes         string | null (max 10000)
  applied_at    ISO date/datetime string | null  (e.g. "2026-09-22")
  created_at    alias for applied_at when applied_at omitted

Rules
-----
• Entire file is validated before any insert (all-or-nothing).
• Duplicate company+role (case-insensitive) for the signed-in user are skipped.
• Unknown fields are rejected.
`;

export async function GET() {
  return NextResponse.json({
    schema: APPLICATION_IMPORT_SCHEMA,
    sample: APPLICATION_IMPORT_SAMPLE,
    statuses: APPLICATION_STATUSES,
    humanReadable: APPLICATION_IMPORT_HUMAN,
  });
}
