import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { deleteUserAccount } from "@/lib/account-delete";
import { requireApiUser } from "@/lib/api-session";
import { auth } from "@/lib/auth";
import { getProfile } from "@/lib/profile";

/**
 * DELETE /api/account
 * Body: { confirm: "DELETE" } or { confirm: "<username>" }
 * Deletes user-owned data; keeps global people rows.
 */
export async function DELETE(request: Request) {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const user = authResult.user;

  let body: { confirm?: string };
  try {
    body = (await request.json()) as { confirm?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const profile = await getProfile(user.id);
  const confirm = (body.confirm ?? "").trim();
  const ok =
    confirm === "DELETE" ||
    (profile?.username && confirm.toLowerCase() === profile.username.toLowerCase());
  if (!ok) {
    return NextResponse.json(
      {
        error: "Type DELETE or your username to confirm account deletion.",
      },
      { status: 400 },
    );
  }

  try {
    await deleteUserAccount(user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Account deletion failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    /* session already gone */
  }

  return NextResponse.json({ ok: true, redirectTo: "/" });
}
