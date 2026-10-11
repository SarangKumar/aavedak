import type { ReactNode } from "react";

import { BeamNode } from "@/components/ui/beam";

function Icon({ children }: { children: ReactNode }) {
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
      {children}
    </svg>
  );
}

// Product rules from docs/decisions.md and the discovery docs, in plain words. Only state
// what the app actually guarantees.
const PROMISES = [
  {
    title: "Original links, always",
    body: "Every job links to the company's own posting, so you always apply at the source.",
    icon: (
      <Icon>
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </Icon>
    ),
  },
  {
    title: "You decide and send",
    body: "Aavedak prepares cover letters and emails. Nothing goes out until you send it, from your own Gmail.",
    icon: (
      <Icon>
        <path d="M20 6 9 17l-5-5" />
      </Icon>
    ),
  },
  {
    title: "Matched to you",
    body: "New roles are ranked against your skills, roles and locations, with a few fresh picks each day.",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="0.5" />
      </Icon>
    ),
  },
  {
    title: "Nothing guessed",
    body: "Aavedak never invents job requirements or guesses anyone's email. Contacts come only from what's published.",
    icon: (
      <Icon>
        <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z" />
        <path d="m9 12 2 2 4-4" />
      </Icon>
    ),
  },
] as const;

/** Homepage: the few rules Aavedak always follows, in plain words. */
export function HomePromises() {
  return (
    <section
      className="aavedak-home-section aavedak-fade-up aavedak-fade-up-delay-4"
      aria-labelledby="promises-heading"
    >
      <div className="mb-3.5 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <h2
          id="promises-heading"
          className="text-foreground text-[14px] font-semibold tracking-tight"
        >
          What Aavedak promises
        </h2>
        <p className="aavedak-meta text-muted-foreground">Rules the whole app follows</p>
      </div>
      <ul className="grid gap-6 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4">
        {PROMISES.map((promise) => (
          <li key={promise.title} className="flex flex-col gap-3">
            <BeamNode size="sm">{promise.icon}</BeamNode>
            <div>
              <h3 className="aavedak-section-title text-foreground">{promise.title}</h3>
              <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
                {promise.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
