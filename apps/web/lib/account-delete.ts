import "server-only";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { detachPeopleForDeletedUser } from "@/lib/people";
import { deleteResumePdf, isGcsObjectKey, toObjectKey } from "@/lib/gcs";

/**
 * Hard-delete a user and all user-owned data.
 * People (referral contacts) stay in the global shared table.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  await ensureAppSchema();
  const sql = getSql();

  const resumes = (await sql`
    SELECT storage_path FROM resumes WHERE user_id = ${userId}
  `) as Array<{ storage_path: string }>;

  for (const row of resumes) {
    const path = row.storage_path?.trim();
    if (path && isGcsObjectKey(path)) {
      await deleteResumePdf(toObjectKey(path));
    }
  }

  // Detach shared people before dropping applications (FK-less, but clear links)
  await detachPeopleForDeletedUser(userId);

  await sql`DELETE FROM friendships WHERE inviter_id = ${userId} OR invitee_id = ${userId}`;
  await sql`DELETE FROM job_scores WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_job_state WHERE user_id = ${userId}`;
  await sql`DELETE FROM follow_up_tasks WHERE user_id = ${userId}`;
  await sql`DELETE FROM job_analyses WHERE user_id = ${userId}`;
  await sql`DELETE FROM jobs WHERE user_id = ${userId}`;
  await sql`DELETE FROM cover_letters WHERE user_id = ${userId}`;
  await sql`DELETE FROM templates WHERE user_id = ${userId}`;
  await sql`DELETE FROM applications WHERE user_id = ${userId}`;
  await sql`DELETE FROM resumes WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_preferences WHERE user_id = ${userId}`;
  await sql`DELETE FROM profiles WHERE user_id = ${userId}`;

  // Better Auth tables on Neon
  await sql`DELETE FROM session WHERE "userId" = ${userId}`;
  await sql`DELETE FROM account WHERE "userId" = ${userId}`;
  await sql`DELETE FROM "user" WHERE id = ${userId}`;
}
