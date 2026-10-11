import Link from "next/link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Answers state only what Aavedak actually does (see docs/decisions.md and the discovery
// docs). Keep them plain — this is the public homepage, the same for every visitor.
const FAQS = [
  {
    id: "sources",
    question: "Where do the jobs come from?",
    answer:
      "From companies' own career pages and the hiring platforms they post on. Aavedak checks them through the day and every job links back to its original posting. It doesn't copy listings from LinkedIn, Naukri or Indeed.",
  },
  {
    id: "who",
    question: "Who is Aavedak for?",
    answer:
      "People early in their careers. It looks for roles in engineering, data, design, QA, IT and junior product that ask for less than three years of experience.",
  },
  {
    id: "control",
    question: "Does Aavedak apply or send emails for me?",
    answer:
      "No. Aavedak recommends and prepares: matched roles, cover letters, and referral and follow-up emails. You review everything, apply on the company's own posting, and emails go out from your Gmail only when you send them.",
  },
  {
    id: "ats",
    question: "What does the ATS check do?",
    answer:
      "It scores your resume against a job description with several ATS-style checks and shows what to improve. Make the changes that help, upload the new version and check again.",
  },
  {
    id: "access",
    question: "How do I get access?",
    answer:
      "Sign in with Google. New accounts are reviewed and approved before the workspace opens, and you can see your status right after signing in.",
  },
] as const;

/** Homepage FAQ: short, plain answers to what people ask before signing up. */
export function HomeFaq() {
  return (
    <section
      className="aavedak-home-section aavedak-fade-up aavedak-fade-up-delay-4"
      aria-labelledby="faq-heading"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr] lg:gap-10">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <h2
            id="faq-heading"
            className="aavedak-display text-foreground text-2xl leading-tight sm:text-3xl"
          >
            Questions
          </h2>
          <p className="text-muted-foreground mt-2.5 max-w-sm text-balance text-[14px] leading-relaxed">
            The short version of how Aavedak works, and what it never does without you.
          </p>
          <Link
            href="/how-it-works"
            className="text-primary mt-4 text-[13px] font-medium hover:underline"
          >
            Read how it works in detail →
          </Link>
        </div>

        <Accordion type="single" collapsible defaultValue="sources">
          {FAQS.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger className="text-foreground text-[14px] font-medium">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-muted-foreground pb-1 text-[14px] leading-relaxed">
                  {faq.answer}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
