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

function inlineFormat(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="font-mono text-[0.9em]">$1</code>')
    .replace(
      /\[([^\]]+)\]\((https?:[^)]+)\)/g,
      '<a href="$2" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>',
    );
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

export function blockToHtml(block: ChangelogBlock): string {
  switch (block.type) {
    case "h1":
      return `<h1 class="aavedak-display text-foreground text-3xl">${inlineFormat(block.text)}</h1>`;
    case "h2":
      return `<h2 class="aavedak-display text-foreground mt-8 text-xl">${inlineFormat(block.text)}</h2>`;
    case "h3":
      return `<h3 class="text-foreground mt-5 text-[15px] font-semibold tracking-tight">${inlineFormat(block.text)}</h3>`;
    case "p":
      return `<p class="text-muted-foreground mt-2 text-[13px] leading-relaxed">${inlineFormat(block.text)}</p>`;
    case "ul":
      return `<ul class="text-muted-foreground mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">${block.items
        .map((i) => `<li>${inlineFormat(i)}</li>`)
        .join("")}</ul>`;
  }
}
