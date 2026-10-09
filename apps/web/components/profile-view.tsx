"use client";

import Link from "next/link";

import { ShellWidth } from "@/components/shell-width";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Profile } from "@/lib/profile";
import {
  FOOTER_ROW_ORDER,
  footerLinkShortLabel,
  profileLinkEntries,
  type ProfileLinkKey,
} from "@/lib/profile-links";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export type ProfileViewProps = {
  profile: Profile;
  isOwner: boolean;
  activeResumeTitle: string | null;
  activeResumeId: string | null;
  /** When set, Edit profile opens this instead of navigating to settings. */
  onEdit?: () => void;
};

function displayName(profile: Profile) {
  return profile.name?.trim() || `@${profile.username}`;
}

function initial(profile: Profile) {
  const base = profile.name?.trim() || profile.username || "?";
  return base.slice(0, 1).toUpperCase();
}

type RowItem = { key: string; label: string; href: string };

function buildProfileFooterRow(profile: Profile): RowItem[] {
  const items: RowItem[] = [];
  const entries = profileLinkEntries(profile.links, profile.customLinks);
  const byKey = new Map(entries.map((e) => [e.key, e]));
  for (const key of FOOTER_ROW_ORDER) {
    if (key === "email") {
      const email = profile.email?.trim();
      if (email) items.push({ key: "email", label: email, href: `mailto:${email}` });
      continue;
    }
    const entry = byKey.get(key as ProfileLinkKey);
    if (!entry) continue;
    items.push({
      key: entry.key,
      label: footerLinkShortLabel(entry.key),
      href: entry.url,
    });
  }
  for (const entry of entries) {
    if (!entry.key.startsWith("custom-")) continue;
    items.push({
      key: entry.key,
      label: entry.label,
      href: entry.url,
    });
  }
  return items;
}

export function ProfileView({
  profile,
  isOwner,
  activeResumeTitle,
  activeResumeId,
  onEdit,
}: ProfileViewProps) {
  const name = displayName(profile);
  const rowItems = buildProfileFooterRow(profile);

  return (
    <ShellWidth className="aavedak-fade-up space-y-5 py-8 sm:py-10">
      <Card className="border-border/80 bg-card ring-ring/10 relative gap-0 overflow-hidden rounded-lg border p-5 shadow-sm ring-1 sm:p-6">
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
            onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="aavedak-btn border-border bg-background/80 text-foreground hover:bg-muted inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border px-3 text-[12px] font-semibold"
              >
                Edit profile
              </button>
            ) : (
              <Link
                href={`/${profile.username}/settings`}
                className="aavedak-btn border-border bg-background/80 text-foreground hover:bg-muted inline-flex h-8 shrink-0 items-center justify-center rounded-lg border px-3 text-[12px] font-semibold"
              >
                Edit profile
              </Link>
            )
          ) : null}
        </div>

        <div className="relative mt-5">
          {rowItems.length > 0 ? (
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] leading-relaxed">
              {rowItems.map((item, idx) => (
                <span key={item.key} className="inline-flex items-center gap-x-1.5">
                  {idx > 0 ? (
                    <span className="text-border" aria-hidden>
                      ⋅
                    </span>
                  ) : null}
                  <a
                    href={item.href}
                    target={item.key === "email" ? undefined : "_blank"}
                    rel={item.key === "email" ? undefined : "noreferrer"}
                    className="text-foreground/90 hover:text-primary underline-offset-2 hover:underline"
                  >
                    {item.label}
                  </a>
                </span>
              ))}
            </p>
          ) : (
            <span className="text-muted-foreground text-[12px]">
              {isOwner ? "Add portfolio, LinkedIn, GitHub, and more in settings." : "No links yet."}
            </span>
          )}
        </div>
      </Card>

      {profile.projects.length > 0 ? (
        <Card className="border-border/80 bg-card ring-ring/10 gap-0 rounded-lg border p-4 shadow-sm ring-1 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">Projects</h2>
            {isOwner ? (
              <Link
                href={`/${profile.username}/settings`}
                className="text-muted-foreground hover:text-foreground text-[11px] font-medium"
              >
                Manage
              </Link>
            ) : null}
          </div>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {profile.projects.map((project) => {
              let host = "";
              let href = project.url.trim();
              if (href) {
                try {
                  const parsed = new URL(href);
                  host = parsed.hostname.replace(/^www\./, "");
                  parsed.searchParams.set("utm_source", "aavedak");
                  href = parsed.toString();
                } catch {
                  host = href;
                  href = href.includes("?")
                    ? `${href}&utm_source=aavedak`
                    : `${href}?utm_source=aavedak`;
                }
              }
              const body = (
                <>
                  <div className="flex min-w-0 items-center gap-2.5">
                    {project.faviconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={project.faviconUrl}
                        alt=""
                        className="size-8 shrink-0 rounded-md object-contain"
                      />
                    ) : (
                      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold uppercase">
                        {(host || project.title).slice(0, 1)}
                      </span>
                    )}
                    <p className="text-foreground truncate text-[13px] font-medium tracking-tight">
                      {project.title}
                    </p>
                  </div>
                  {project.description ? (
                    <p className="text-muted-foreground line-clamp-2 text-[12px] leading-relaxed">
                      {project.description}
                    </p>
                  ) : host ? (
                    <p className="text-muted-foreground truncate text-[11px]">{host}</p>
                  ) : null}
                </>
              );
              const cardClass =
                "border-border/70 bg-background/50 flex h-full flex-col gap-1.5 rounded-lg border px-3 py-2.5";
              return (
                <li key={project.id} className="min-w-0">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        cardClass,
                        "hover:border-border hover:bg-muted/20 transition-colors",
                      )}
                    >
                      {body}
                    </a>
                  ) : (
                    <div className={cardClass}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : isOwner ? (
        <Card className="border-border/80 bg-card ring-ring/10 gap-0 rounded-lg border p-4 shadow-sm ring-1 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-foreground text-[13px] font-semibold tracking-tight">Projects</h2>
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="text-muted-foreground hover:text-foreground cursor-pointer text-[11px] font-medium"
              >
                Add projects
              </button>
            ) : (
              <Link
                href={`/${profile.username}/settings`}
                className="text-muted-foreground hover:text-foreground text-[11px] font-medium"
              >
                Add projects
              </Link>
            )}
          </div>
          <p className="text-muted-foreground mt-2 text-[13px]">
            Showcase deployed work with a title, short description, and favicon.
          </p>
        </Card>
      ) : null}

      <Card className="border-border/80 bg-card ring-ring/10 gap-0 rounded-lg border p-4 shadow-sm ring-1 sm:p-5">
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
        {activeResumeTitle && activeResumeId ? (
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
                  ? "Your single active showcase resume — open to view the PDF."
                  : "Showcase resume on Aavedak."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={`/api/resumes/${activeResumeId}/file`}
                target="_blank"
                rel="noreferrer"
                className="border-border text-foreground hover:bg-muted inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium"
              >
                View
              </a>
              <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Active
              </span>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-[13px]">
            {isOwner
              ? "No showcase resume — activate one in settings or Documents."
              : "No public resume listed yet."}
          </p>
        )}
      </Card>
    </ShellWidth>
  );
}
