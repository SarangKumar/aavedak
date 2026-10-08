import { SiteHeaderBar } from "@/components/site-header-bar";
import { isAdminEmail } from "@/lib/admin";
import { getServerSession } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { countPendingApprovals } from "@/lib/user-approval";
import { usernameFromUser } from "@/lib/username";
import { cn } from "@/lib/utils";

export async function SiteHeader({ className }: { className?: string }) {
  const session = await getServerSession();

  const sessionUser = session?.user;
  let username = "";
  let isAdmin = false;
  let pendingApprovals = 0;

  if (sessionUser?.email) {
    isAdmin = isAdminEmail(sessionUser.email);
    try {
      username = (
        await ensureProfile({
          id: sessionUser.id,
          email: sessionUser.email,
          name: sessionUser.name,
          image: sessionUser.image,
        })
      ).username;
    } catch {
      username = usernameFromUser({
        email: sessionUser.email,
        name: sessionUser.name,
      });
    }
    if (isAdmin) {
      try {
        pendingApprovals = await countPendingApprovals();
      } catch {
        pendingApprovals = 0;
      }
    }
  }

  const user = sessionUser?.email
    ? {
        name: sessionUser.name || sessionUser.email,
        email: sessionUser.email,
        image: sessionUser.image,
        username:
          username ||
          usernameFromUser({
            email: sessionUser.email,
            name: sessionUser.name,
          }),
        isAdmin,
        pendingApprovals,
      }
    : null;

  return (
    <header
      className={cn(
        "border-border/60 bg-background/70 sticky top-0 z-50 overflow-visible border-b backdrop-blur-xl",
        className,
      )}
    >
      <SiteHeaderBar user={user} />
    </header>
  );
}
