"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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
import { cn } from "@/lib/utils";

type MenuLink = { href: string; label: string; description: string };

const DOCUMENT_LINKS: MenuLink[] = [
  {
    href: "/documents?tab=resumes",
    label: "Resume",
    description: "Upload resumes and pick showcase.",
  },
  {
    href: "/documents?tab=cover_letters",
    label: "Cover Letter",
    description: "Write and keep cover letters per job.",
  },
  {
    href: "/documents?tab=referral_email",
    label: "Referral Email",
    description: "The template used to ask for referrals.",
  },
  {
    href: "/documents?tab=followup_email",
    label: "Follow-up Email",
    description: "The template used for follow-ups.",
  },
];

const REFERRAL_LINKS: MenuLink[] = [
  {
    href: "/referrals",
    label: "Referrals",
    description: "Pick a job and the people to ask for a referral.",
  },
  {
    href: "/outreach",
    label: "Inbox",
    description: "Your sent mails, replies and follow-ups.",
  },
];

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
        className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring block rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2"
      >
        <span className="text-foreground block text-[13px] font-medium">{link.label}</span>
        <span className="text-muted-foreground mt-0.5 block text-[12px] leading-snug">
          {link.description}
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
                    Referrals board
                  </Link>
                  <Link
                    href="/outreach/board"
                    onClick={close}
                    className={cn(buttonVariants({ variant: "secondary", size: "xs" }), "w-full")}
                  >
                    Inbox board
                  </Link>
                </div>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {directLink("/ats", "ATS")}
      </NavigationMenuList>
      <NavigationMenuViewport />
    </NavigationMenu>
  );
}
