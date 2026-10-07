import Link from "next/link";

import { ShellWidth } from "@/components/shell-width";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/lib/profile";
import { profileLinkEntries } from "@/lib/profile-links";
import { cn } from "@/lib/utils";

export type ProfileViewProps = {
  profile: Profile;
  isOwner: boolean;
  activeResumeTitle: string | null;
};

function displayName(profile: Profile) {
  return profile.name?.trim() || `@${profile.username}`;
}

function initial(profile: Profile) {
  const base = profile.name?.trim() || profile.username || "?";
  return base.slice(0, 1).toUpperCase();
}

export function ProfileView({ profile, isOwner, activeResumeTitle }: ProfileViewProps) {
  const name = displayName(profile);
  const linkEntries = profileLinkEntries(profile.links);

  return (
    <ShellWidth className="aavedak-fade-up space-y-5 py-8 sm:py-10">
      <div className="border-border/80 bg-card ring-ring/10 relative overflow-hidden rounded-lg border p-5 shadow-sm ring-1 sm:p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar className="size-14 sm:size-16">
              {profile.imageUrl ? <AvatarImage src={profile.imageUrl} alt={name} /> : null}
              <AvatarFallback className="text-base font-semibold sm:text-lg">
                {initial(profile)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <h1 className="aavedak-display text-foreground text-xl tracking-tight sm:text-2xl">
                {name}
              </h1>
              <p className="text-muted-foreground text-[13px]">@{profile.username}</p>
              {profile.bio ? (
                <p className="text-foreground/90 mt-2 max-w-xl text-pretty text-[13px] leading-relaxed sm:text-sm">
                  {profile.bio}
                </p>
              ) : (
                <p className="text-muted-foreground mt-2 text-[13px] italic">
                  {isOwner ? "Add a short bio in settings." : "No bio yet."}
                </p>
              )}
            </div>
          </div>

          {isOwner ? (
            <Link
              href={`/${profile.username}/settings`}
              className="aavedak-btn border-border bg-background/80 text-foreground hover:bg-muted inline-flex h-8 shrink-0 items-center justify-center rounded-lg border px-3 text-[12px] font-semibold"
            >
              Edit profile
            </Link>
          ) : null}
        </div>

        <div className="relative mt-5 flex flex-wrap gap-2">
          {linkEntries.map((entry) => (
            <a
              key={entry.key}
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="border-border/80 bg-background/60 text-foreground hover:border-primary/40 inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px] font-medium"
            >
              {entry.label}
            </a>
          ))}
          {linkEntries.length === 0 ? (
            <span className="text-muted-foreground text-[12px]">
              {isOwner ? "Add portfolio, LinkedIn, GitHub, and more in settings." : "No links yet."}
            </span>
          ) : null}
        </div>
      </div>

      <div className="border-border/80 bg-card ring-ring/10 rounded-lg border p-4 shadow-sm ring-1 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-foreground text-[13px] font-semibold tracking-tight">
            Showcase resume
          </h2>
          {isOwner ? (
            <Link
              href={`/${profile.username}/settings`}
              className="text-muted-foreground hover:text-foreground text-[11px] font-medium"
            >
              Manage
            </Link>
          ) : null}
        </div>
        {activeResumeTitle ? (
          <div
            className={cn(
              "border-border/70 bg-background/50 mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
            )}
          >
            <div className="min-w-0">
              <p className="text-foreground truncate text-[13px] font-medium">
                {activeResumeTitle}
              </p>
              <p className="text-muted-foreground text-[11px]">
                {isOwner
                  ? "Your single active showcase resume (download stays private for now)."
                  : "Showcase resume on Aavedak."}
              </p>
            </div>
            <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
              Active
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-[13px]">
            {isOwner
              ? "No showcase resume — activate one in settings or Documents."
              : "No public resume listed yet."}
          </p>
        )}
      </div>
    </ShellWidth>
  );
}
