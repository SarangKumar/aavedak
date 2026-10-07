import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { applicationToDto, listApplications } from "@/lib/applications";

/** Downloadable applications JSON for backup / re-import on the tracker. */
export async function GET() {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;

  const [active, archived] = await Promise.all([
    listApplications(authResult.user.id, "active"),
    listApplications(authResult.user.id, "archived"),
  ]);
  const applications = [...active, ...archived];
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    notice:
      "Testing feature. Periodically download a backup of your applications. You can upload this JSON on the tracker Import dialog to restore rows.",
    applications: applications.map((app) => {
      const dto = applicationToDto(app);
      return {
        company_name: dto.companyName,
        role: dto.role,
        location: dto.location,
        salary_ctc: dto.salaryCtc,
        job_link: dto.jobLink,
        job_id: dto.jobId,
        status: dto.status,
        notes: dto.notes,
        applied_at: dto.appliedAt,
        created_at: dto.createdAt,
      };
    }),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="aavedak-applications-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
