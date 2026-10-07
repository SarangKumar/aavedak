import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";

const CONTACT = "sarangkumar1578@gmail.com";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
  title: "Terms of Service",
  description: "Terms for using Aavedak, the job-search workspace.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="8 October 2026"
      intro={
        <p>
          By signing in to Aavedak at aavedak.vercel.app you agree to these terms. If you do not
          agree, do not use the service.
        </p>
      }
      sections={[
        {
          title: "The service",
          body: (
            <p>
              Aavedak helps you track job applications, manage resumes and cover letters, organise
              referral contacts, and send follow-up emails you approve. Aavedak recommends and
              prepares; you decide and send. Access may be limited to a small number of accounts.
            </p>
          ),
        },
        {
          title: "Your account and content",
          body: (
            <p>
              You sign in with Google and are responsible for activity on your account. You own the
              content you upload and grant Aavedak permission to store and process it only to run
              the service for you.
            </p>
          ),
        },
        {
          title: "Email sending",
          body: (
            <p>
              If you authorize Gmail send, emails go out from your Gmail account only after you
              confirm them. You are responsible for their content and for complying with anti-spam
              laws and Gmail policies. Do not use Aavedak for bulk or unsolicited marketing.
            </p>
          ),
        },
        {
          title: "Acceptable use",
          body: (
            <p>
              Do not misuse the service, attempt to access other users&rsquo; data, upload unlawful
              content, or add contacts you have no legitimate reason to reach.
            </p>
          ),
        },
        {
          title: "No warranty; liability",
          body: (
            <p>
              Aavedak is provided &ldquo;as is&rdquo; without warranties. Match and ATS scores are
              estimates, not guarantees of any hiring outcome. To the extent permitted by law,
              Aavedak is not liable for indirect or consequential damages.
            </p>
          ),
        },
        {
          title: "Termination and changes",
          body: (
            <p>
              You can delete your account anytime from Profile → Danger Zone. We may suspend
              accounts that violate these terms and may update them; continued use means you accept
              the updated terms.
            </p>
          ),
        },
        {
          title: "Contact",
          body: (
            <p>
              <a className="text-primary hover:underline" href={`mailto:${CONTACT}`}>
                {CONTACT}
              </a>{" "}
              · See the{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
