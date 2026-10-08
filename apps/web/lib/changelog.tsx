import type { ReactNode } from "react";
import fs from "node:fs";
import path from "node:path";

/** Resolve repo-root CHANGELOG.md from apps/web or monorepo root cwd. */
export function readChangelogMarkdown(): string {
  const candidates = [
    path.join(process.cwd(), "CHANGELOG.md"),
    path.join(process.cwd(), "..", "CHANGELOG.md"),
    path.join(process.cwd(), "..", "..", "CHANGELOG.md"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    } catch {
      /* try next */
    }
  }
  return "# Changelog\n\nNo changelog found.\n";
}

export type ChangelogBlock =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export function parseChangelog(md: string): ChangelogBlock[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: ChangelogBlock[] = [];
  let listItems: string[] | null = null;

  function flushList() {
    if (listItems && listItems.length) {
      blocks.push({ type: "ul", items: listItems });
    }
    listItems = null;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^### /.test(line)) {
      flushList();
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      continue;
    }
    if (/^## /.test(line)) {
      flushList();
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      continue;
    }
    if (/^# /.test(line)) {
      flushList();
      blocks.push({ type: "h1", text: line.slice(2).trim() });
      continue;
    }
    if (/^[-*] /.test(line)) {
      if (!listItems) listItems = [];
      listItems.push(line.slice(2).trim());
      continue;
    }
    if (!line.trim()) {
      flushList();
      continue;
    }
    flushList();
    blocks.push({ type: "p", text: line.trim() });
  }
  flushList();
  return blocks;
}

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:[^)]+\))/g;

function formatInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={key++} className="font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:[^)]+)\)$/);
      if (link) {
        parts.push(
          <a
            key={key++}
            href={link[2]}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {link[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    }
    last = start + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ChangelogBlockView({ block }: { block: ChangelogBlock }) {
  switch (block.type) {
    case "h1":
      return (
        <h1 className="aavedak-display text-foreground text-3xl">{formatInline(block.text)}</h1>
      );
    case "h2":
      return (
        <h2 className="aavedak-display text-foreground mt-8 text-xl">
          {formatInline(block.text)}
        </h2>
      );
    case "h3":
      return (
        <h3 className="text-foreground mt-5 text-[15px] font-semibold tracking-tight">
          {formatInline(block.text)}
        </h3>
      );
    case "p":
      return (
        <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed">
          {formatInline(block.text)}
        </p>
      );
    case "ul":
      return (
        <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
          {block.items.map((item, i) => (
            <li key={i}>{formatInline(item)}</li>
          ))}
        </ul>
      );
  }
}
