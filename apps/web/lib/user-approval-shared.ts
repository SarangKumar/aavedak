export type ApprovalStatus = "pending" | "approved" | "rejected";

export const PENDING_APPROVAL_MESSAGE = "Your account is waiting for an admin to approve access.";
export const REJECTED_APPROVAL_MESSAGE =
  "Your access request was not approved. Contact an admin if you think this is a mistake.";

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

export type PendingUserRow = {
  userId: string;
  username: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  createdAt: string;
};
