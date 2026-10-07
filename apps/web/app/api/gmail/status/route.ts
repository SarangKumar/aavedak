import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/api-session";
import { getGmailAuthStatus } from "@/lib/gmail";
import { GMAIL_SEND_SCOPE } from "@/lib/gmail-scopes";

export async function GET() {
  const authResult = await requireApiUser();
  if (authResult.error) return authResult.error;
  const status = await getGmailAuthStatus(authResult.user.id);
  return NextResponse.json({
    ...status,
    requiredScope: GMAIL_SEND_SCOPE,
  });
}
