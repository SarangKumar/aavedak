/**
 * Versioned calibration fixtures — anonymized sample resumes/JDs.
 * Store observed vendor scores here when lawfully obtained; never hardcode
 * them into production scoring logic.
 */

export const CALIBRATION_DATASET_VERSION = "2026-04-01";

export type CalibrationCase = {
  id: string;
  label: string;
  resumeText: string;
  role: string;
  jdText: string;
  /** Optional vendor observations for offline MAE reports. */
  vendorScores?: Partial<
    Record<
      "jobscan" | "resume_worded" | "teal" | "rezi" | "skillsyncer",
      { overall?: number; notes?: string }
    >
  >;
};

export const CALIBRATION_CASES: CalibrationCase[] = [
  {
    id: "backend-fastapi-01",
    label: "Backend FastAPI vs Backend JD",
    resumeText: `
Alex Rivera
alex@example.com | +1 555 0100
SUMMARY
Backend engineer with Python and API experience.
EXPERIENCE
Backend Engineer — Acme — 2020 – Present
Built FastAPI services in Python with PostgreSQL cutting latency 30%.
Implemented Dockerized deployments and SQL tuning.
EDUCATION
B.S. Computer Science
SKILLS
Python, FastAPI, PostgreSQL, SQL, Docker, communication
`,
    role: "Backend Engineer",
    jdText: `
Backend Engineer
Requirements: Python, FastAPI, PostgreSQL, Docker, Kubernetes, communication
Nice to have: Redis
Responsibilities: Design and build scalable backend APIs
Education: Bachelor's degree preferred
`,
    vendorScores: {
      // Fill after lawful reference runs — left empty on purpose.
    },
  },
];
