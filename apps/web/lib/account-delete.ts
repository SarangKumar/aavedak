import "server-only";

import { ensureAppSchema, getSql } from "@/lib/app-db";
import { detachPeopleForDeletedUser } from "@/lib/people";
import { deleteResumePdf, isGcsObjectKey, toObjectKey } from "@/lib/gcs";

async function deleteUserResumeFiles(userId: string): Promise<void> {
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
}

/**
 * Delete tracker / document / job data for a user, but keep the account and
 * people they added (clears application links on those people rows only).
 */
export async function wipeUserAccountData(userId: string): Promise<void> {
  await ensureAppSchema();
  const sql = getSql();

  await deleteUserResumeFiles(userId);

  const now = new Date().toISOString();
  // Keep people; only drop application FKs that would dangle after wipe.
  await sql`
    UPDATE people
    SET application_id = NULL, updated_at = ${now}
    WHERE application_id IN (SELECT id FROM applications WHERE user_id = ${userId})
  `;

  await sql`DELETE FROM job_scores WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_job_state WHERE user_id = ${userId}`;
  await sql`DELETE FROM follow_up_tasks WHERE user_id = ${userId}`;
  await sql`DELETE FROM job_analyses WHERE user_id = ${userId}`;
  await sql`DELETE FROM jobs WHERE user_id = ${userId}`;
  await sql`DELETE FROM cover_letters WHERE user_id = ${userId}`;
  await sql`DELETE FROM templates WHERE user_id = ${userId}`;
  await sql`DELETE FROM application_events WHERE user_id = ${userId}`;
  await sql`DELETE FROM person_votes WHERE user_id = ${userId}`;
  await sql`DELETE FROM applications WHERE user_id = ${userId}`;
  await sql`DELETE FROM resumes WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_preferences WHERE user_id = ${userId}`;
}

/**
 * Hard-delete a user and all user-owned data.
 * People (referral contacts) stay in the global shared table.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  await ensureAppSchema();
  const sql = getSql();

  await deleteUserResumeFiles(userId);

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
  await sql`DELETE FROM application_events WHERE user_id = ${userId}`;
  await sql`DELETE FROM person_votes WHERE user_id = ${userId}`;
  await sql`DELETE FROM applications WHERE user_id = ${userId}`;
  await sql`DELETE FROM resumes WHERE user_id = ${userId}`;
  await sql`DELETE FROM user_preferences WHERE user_id = ${userId}`;
  await sql`DELETE FROM profiles WHERE user_id = ${userId}`;

  // Better Auth tables on Neon
  await sql`DELETE FROM session WHERE "userId" = ${userId}`;
  await sql`DELETE FROM account WHERE "userId" = ${userId}`;
  await sql`DELETE FROM "user" WHERE id = ${userId}`;
}
