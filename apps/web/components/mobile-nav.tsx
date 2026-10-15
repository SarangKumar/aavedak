"use client";

import Link from "next/link";

import { FEATURES, type FeatureKey } from "@/lib/features";
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

export type NavItem = {
  href: string;
  label: string;
  feature: FeatureKey;
};

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

function NavIcon({ feature }: { feature: FeatureKey }) {
  const Icon = FEATURES[feature].icon;
  return <Icon aria-hidden strokeWidth={1.75} />;
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
                            <NavIcon feature={item.feature} />
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
