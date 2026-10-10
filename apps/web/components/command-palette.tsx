"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { authClient, signOutAndRedirect } from "@/lib/auth-client";
import { themeCookieString, THEME_KEY, type ThemeMode } from "@/lib/theme";

export function CommandPalette() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  function setTheme(mode: ThemeMode) {
    if (mode === "system") {
      document.documentElement.classList.toggle(
        "dark",
        window.matchMedia("(prefers-color-scheme: dark)").matches,
      );
    } else {
      document.documentElement.classList.toggle("dark", mode === "dark");
    }
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      /* ignore */
    }
    document.cookie = themeCookieString(mode);
    setOpen(false);
  }

  async function signOut() {
    setOpen(false);
    try {
      await signOutAndRedirect("/sign-in");
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : "Sign out failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search pages and actions.</DialogDescription>
        </DialogHeader>
        <Command className="rounded-none border-0 bg-transparent shadow-none">
          <CommandInput placeholder="Search commands…" className="text-[14px]" />
          <CommandList className="max-h-80">
            <CommandEmpty>No results.</CommandEmpty>
            {signedIn ? (
              <CommandGroup heading="Navigate">
                <CommandItem value="dashboard" onClick={() => go("/dashboard")}>
                  Dashboard
                  <CommandShortcut>⌘K</CommandShortcut>
                </CommandItem>
                <CommandItem value="jobs" onClick={() => go("/jobs")}>
                  Jobs
                </CommandItem>
                <CommandItem value="job tracker" onClick={() => go("/job-tracker")}>
                  Job tracker
                </CommandItem>
                <CommandItem value="documents" onClick={() => go("/documents")}>
                  Documents
                </CommandItem>
                <CommandItem value="referrals" onClick={() => go("/referrals")}>
                  Referrals
                </CommandItem>
                <CommandItem value="ats" onClick={() => go("/ats")}>
                  ATS score
                </CommandItem>
                <CommandItem value="people" onClick={() => go("/people")}>
                  People
                </CommandItem>
                <CommandItem value="outreach follow ups" onClick={() => go("/outreach")}>
                  Outreach
                </CommandItem>
                <CommandItem value="about" onClick={() => go("/about")}>
                  About
                </CommandItem>
                <CommandItem value="changelog" onClick={() => go("/changelog")}>
                  Changelog
                </CommandItem>
              </CommandGroup>
            ) : (
              <CommandGroup heading="Navigate">
                <CommandItem value="home" onClick={() => go("/")}>
                  Home
                </CommandItem>
                <CommandItem value="sign in" onClick={() => go("/sign-in")}>
                  Sign in
                </CommandItem>
                <CommandItem value="changelog" onClick={() => go("/changelog")}>
                  Changelog
                </CommandItem>
              </CommandGroup>
            )}
            {signedIn ? (
              <CommandGroup heading="Actions">
                <CommandItem value="new application" onClick={() => go("/job-tracker")}>
                  New application…
                </CommandItem>
                <CommandItem value="sign out" onClick={() => void signOut()}>
                  Sign out
                </CommandItem>
              </CommandGroup>
            ) : null}
            <CommandGroup heading="Theme">
              <CommandItem value="dark theme" onClick={() => setTheme("dark")}>
                Dark theme
              </CommandItem>
              <CommandItem value="light theme" onClick={() => setTheme("light")}>
                Light theme
              </CommandItem>
              <CommandItem value="system theme" onClick={() => setTheme("system")}>
                System theme
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <CommandFooter className="text-muted-foreground justify-between text-[11px]">
            <span>
              <Kbd>⌘</Kbd>/<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>
            </span>
            <span>↑↓ · ↵ · esc</span>
          </CommandFooter>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
