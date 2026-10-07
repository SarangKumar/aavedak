import { NextResponse } from "next/server";

import { applicationToDto, listApplications } from "@/lib/applications";
import { auth } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";

/** Downloadable applications JSON for backup / re-import on the tracker. */
export async function GET() {
  const session = await auth.api.getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureProfile({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  const [active, archived] = await Promise.all([
    listApplications(session.user.id, "active"),
    listApplications(session.user.id, "archived"),
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
        companyName: dto.companyName,
        role: dto.role,
        location: dto.location,
        salaryCtc: dto.salaryCtc,
        jobLink: dto.jobLink,
        status: dto.status,
        notes: dto.notes,
        appliedAt: dto.appliedAt,
      };
    }),
  };

  const body = `${JSON.stringify(payload, null, 2)}\n`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="aavedak-applications-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
