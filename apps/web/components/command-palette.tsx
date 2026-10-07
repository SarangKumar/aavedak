"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
import { authClient, signOutAndRedirect } from "@/lib/auth-client";
import { themeCookieString, THEME_KEY, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center px-4 pt-[min(20vh,8rem)]">
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={cn(
          "border-border bg-card text-card-foreground dark relative z-10 w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl shadow-black/50",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="bg-transparent">
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
                <CommandItem value="follow ups" onClick={() => go("/follow-ups")}>
                  Follow-ups
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
              <kbd className="font-mono">⌘</kbd>/<kbd className="font-mono">Ctrl</kbd>+
              <kbd className="font-mono">K</kbd>
            </span>
            <span>↑↓ · ↵ · esc</span>
          </CommandFooter>
        </Command>
      </div>
    </div>,
    document.body,
  );
}
