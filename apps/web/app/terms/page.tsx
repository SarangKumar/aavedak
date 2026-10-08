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
              content you upload and grant Aavedak permission to store and process it to run the
              service. For resumes, templates, applications, and similar private workspace content,
              that use is to provide the product to you. For people/contacts, see the section below.
            </p>
          ),
        },
        {
          title: "Shared people directory",
          body: (
            <>
              <p>
                When you add people (referral contacts) in Aavedak, you contribute that data to a{" "}
                <strong>global, website-wide directory</strong>. Other users of Aavedak may see and
                use people entries contributed through the service. By adding a person, you confirm
                you have a legitimate reason to do so and that you understand the entry is not
                private to your account alone.
              </p>
              <p>
                <strong>Account deletion may not remove people you added.</strong> Deleting your
                account removes your personal workspace data, but people records you contributed may
                remain in the shared directory for other users. If you need a specific shared entry
                reviewed for removal, contact us.
              </p>
            </>
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
              You can delete your account anytime from Profile → Danger Zone. Deletion removes your
              account and private workspace data; it does not guarantee removal of people/contacts
              you previously contributed to the global directory (see &ldquo;Shared people
              directory&rdquo;). We may suspend accounts that violate these terms and may update
              them; continued use means you accept the updated terms.
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
