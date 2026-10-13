"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { HeaderUser } from "@/components/auth-header-actions";
import { BrandMark } from "@/components/brand-mark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

type IconName =
  | "dashboard"
  | "jobs"
  | "tracker"
  | "ats"
  | "improve"
  | "upload"
  | "documents"
  | "referrals"
  | "outreach"
  | "people";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
};

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

/** Small stroke icons (the app has no icon library), 16px, following currentColor. */
const ICON_PATHS: Record<IconName, string> = {
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  jobs: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 7h18v13H3zM3 13h18",
  tracker: "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v6h-4z",
  upload: "M12 15V3m0 0-4 4m4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  improve: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  ats: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  documents: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  referrals:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  outreach: "M4 4h16v12H5.2L4 17.2zM8 9h8M8 12h5",
  people:
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
};

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function MenuToggle() {
  const { openMobile, setOpenMobile } = useSidebar();
  return (
    <Button
      variant="outline"
      size="icon-sm"
      type="button"
      aria-label={openMobile ? "Close menu" : "Open menu"}
      aria-expanded={openMobile}
      onClick={() => setOpenMobile((value) => !value)}
    >
      <span className="flex w-3.5 flex-col gap-0.5" aria-hidden>
        <span className="bg-foreground block h-0.5 w-full rounded" />
        <span className="bg-foreground block h-0.5 w-full rounded" />
        <span className="bg-foreground block h-0.5 w-full rounded" />
      </span>
    </Button>
  );
}

function MobileSidebar({ groups, user }: { groups: readonly NavGroup[]; user: HeaderUser | null }) {
  const pathname = usePathname() || "";
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);

  return (
    <Sidebar side="left">
      <SidebarHeader className="border-sidebar-border border-b px-3 py-3">
        <Link href="/" onClick={close} className="flex items-center gap-2.5">
          <BrandMark alt="" width={28} height={28} className="size-7" />
          <span className="flex flex-col leading-tight">
            <span className="aavedak-display text-sidebar-foreground text-sm">Aavedak</span>
            <span className="text-muted-foreground text-[11px]">Job-search OS</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent aria-label="Mobile">
        {groups.map((group, index) => (
          <div key={group.label}>
            {index > 0 ? <SidebarSeparator /> : null}
            <SidebarGroup>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active}>
                          <Link
                            href={item.href}
                            onClick={close}
                            aria-current={active ? "page" : undefined}
                          >
                            <NavIcon name={item.icon} />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      {user ? (
        <SidebarFooter className="border-sidebar-border border-t">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive(pathname, `/${user.username}`)}>
                <Link href={`/${user.username}`} onClick={close}>
                  <Avatar className="size-8">
                    {user.image ? (
                      <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />
                    ) : null}
                    <AvatarFallback>
                      {(user.name || user.email).slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-[13px] font-medium">{user.name}</span>
                    <span className="text-muted-foreground truncate text-[11px]">{user.email}</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}

/**
 * Phone menu (below md): the Vinyaas sidebar, which renders as a left drawer on small screens,
 * laid out like the shadcn sidebar — brand header, labelled groups with icons, account footer.
 * The provider is scoped to this button so it doesn't wrap the page or claim ⌘B.
 */
export function MobileNav({
  groups,
  user,
}: {
  groups: readonly NavGroup[];
  user: HeaderUser | null;
}) {
  return (
    <div className="md:hidden">
      <SidebarProvider keyboardShortcut={false} className="min-h-0 w-auto">
        <MenuToggle />
        <MobileSidebar groups={groups} user={user} />
      </SidebarProvider>
    </div>
  );
}
