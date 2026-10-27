"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@/components/ui/navigation-menu";
import { FEATURES, type Feature } from "@/lib/features";
import { cn } from "@/lib/utils";

type MenuLink = { href: string; label: string; description: string; icon?: Feature["icon"] };

const DOCUMENT_LINKS: MenuLink[] = [
  FEATURES.resumes,
  FEATURES.coverLetters,
  FEATURES.referralEmail,
  FEATURES.followUpEmail,
];

const REFERRAL_LINKS: MenuLink[] = [FEATURES.referrals, FEATURES.inbox];

const RESUME_LINKS: MenuLink[] = [
  FEATURES.createResume,
  FEATURES.resumeScore,
  FEATURES.improveResume,
  FEATURES.uploadResume,
];

/** Name of the active resume, fetched once the Resume panel is first opened. */
function useActiveResumeName(enabled: boolean) {
  const [name, setName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled || loaded) return;
    setLoaded(true);
    fetch("/api/resumes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { resumes?: { displayName: string; status: string }[] } | null) =>
        setName(d?.resumes?.find((r) => r.status === "active")?.displayName ?? null),
      )
      .catch(() => {});
  }, [enabled, loaded]);
  return name;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const topItemClass =
  "text-muted-foreground hover:text-foreground hover:bg-foreground/5 h-auto rounded-lg bg-transparent px-2 py-1 text-[13px] font-medium transition-colors";
const topItemActiveClass = "text-foreground bg-foreground/5";

function PanelLink({ link, onNavigate }: { link: MenuLink; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href={link.href}
        onClick={onNavigate}
        className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring flex gap-2.5 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2"
      >
        {link.icon ? (
          <link.icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        ) : null}
        <span>
          <span className="text-foreground block text-[13px] font-medium">{link.label}</span>
          <span className="text-muted-foreground mt-0.5 block text-[12px] leading-snug">
            {link.description}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Laptop/desktop header nav: plain links plus Documents and Referrals mega-menu panels. */
export function DesktopNavMenu() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);

  const directLink = (href: string, label: string) => {
    const active = isActive(pathname, href);
    return (
      <NavigationMenuItem>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          // Moving onto a plain link closes any open panel, like the triggers do.
          onMouseEnter={close}
          onFocus={close}
          className={cn(topItemClass, "inline-flex items-center", active && topItemActiveClass)}
        >
          {label}
        </Link>
      </NavigationMenuItem>
    );
  };

  const documentsActive = isActive(pathname, "/documents");
  const activeResume = useActiveResumeName(open === "resume");
  const resumeActive =
    isActive(pathname, "/ats") ||
    isActive(pathname, "/resume-improver") ||
    isActive(pathname, "/resume-creator");
  const referralsActive = isActive(pathname, "/referrals") || isActive(pathname, "/outreach");

  return (
    <NavigationMenu
      value={open}
      onValueChange={setOpen}
      aria-label="Main"
      className="ml-1 hidden md:flex"
    >
      <NavigationMenuList className="flex-none justify-start gap-0.5">
        {directLink("/dashboard", "Dashboard")}
        {directLink("/jobs", "Jobs")}
        {directLink("/job-tracker", "Tracker")}

        <NavigationMenuItem value="documents">
          <NavigationMenuTrigger
            className={cn(
              topItemClass,
              "gap-1 focus-visible:ring-offset-0",
              (documentsActive || open === "documents") && topItemActiveClass,
            )}
          >
            Documents
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="w-120 grid grid-cols-2 gap-1">
              {DOCUMENT_LINKS.map((link) => (
                <PanelLink key={link.href} link={link} onNavigate={close} />
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem value="referrals">
          <NavigationMenuTrigger
            className={cn(
              topItemClass,
              "gap-1 focus-visible:ring-offset-0",
              (referralsActive || open === "referrals") && topItemActiveClass,
            )}
          >
            Referrals
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="w-lg grid grid-cols-[1fr_13rem] gap-3">
              <ul className="flex flex-col gap-1">
                {REFERRAL_LINKS.map((link) => (
                  <PanelLink key={link.href} link={link} onNavigate={close} />
                ))}
              </ul>
              <div className="bg-card flex aspect-square flex-col rounded-lg border p-4">
                <Badge variant="secondary" className="w-fit text-[10px]">
                  Full screen
                </Badge>
                <p className="text-foreground mt-2 text-[13px] font-semibold">More room to work</p>
                <p className="text-muted-foreground mt-1 text-[12px] leading-snug">
                  Open your referrals board or inbox full screen, without the page around it.
                </p>
                <div className="mt-auto flex flex-col gap-1.5">
                  <Link
                    href="/referrals/board"
                    onClick={close}
                    className={cn(buttonVariants({ variant: "default", size: "xs" }), "w-full")}
                  >
                    <FEATURES.referrals.icon aria-hidden />
                    Referrals board
                  </Link>
                  <Link
                    href="/outreach/board"
                    onClick={close}
                    className={cn(buttonVariants({ variant: "secondary", size: "xs" }), "w-full")}
                  >
                    <FEATURES.inbox.icon aria-hidden />
                    Inbox board
                  </Link>
                </div>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem value="resume">
          <NavigationMenuTrigger
            className={cn(
              topItemClass,
              "gap-1 focus-visible:ring-offset-0",
              (resumeActive || open === "resume") && topItemActiveClass,
            )}
          >
            Resume
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="w-lg grid grid-cols-[13rem_1fr] gap-3">
              <div className="bg-card flex flex-col rounded-lg border p-4">
                <FEATURES.documents.icon className="text-primary size-4" aria-hidden />
                <p className="text-foreground mt-2 text-[13px] font-semibold">Resumes</p>
                <p className="text-muted-foreground mt-1 text-[12px] leading-snug">
                  Create, score, improve and manage your resumes.
                </p>
                <p className="text-muted-foreground mt-auto pt-3 text-[11px]">
                  Active:{" "}
                  <span className="text-foreground font-medium">{activeResume ?? "none yet"}</span>
                </p>
              </div>
              <ul className="flex flex-col gap-1">
                {RESUME_LINKS.map((link) => (
                  <PanelLink key={link.href} link={link} onNavigate={close} />
                ))}
              </ul>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
      <NavigationMenuViewport />
    </NavigationMenu>
  );
}
