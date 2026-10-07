import { SiteHeaderBar } from "@/components/site-header-bar";
import { getServerSession } from "@/lib/auth";
import { ensureProfile } from "@/lib/profile";
import { usernameFromUser } from "@/lib/username";
import { cn } from "@/lib/utils";

export async function SiteHeader({ className }: { className?: string }) {
  const session = await getServerSession();

  const sessionUser = session?.user;
  let username = "";
  if (sessionUser?.email) {
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
