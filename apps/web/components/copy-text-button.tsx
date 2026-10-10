"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Copies a fixed piece of text (e.g. the About page summary) and confirms inline. */
export function CopyTextButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      // Clipboard access can be blocked (permissions, insecure context); the text stays
      // selectable on the page, so just say so.
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2000);
  }

  return (
    <Button type="button" size="xs" variant="outline" onClick={() => void copy()}>
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label}
    </Button>
  );
}
