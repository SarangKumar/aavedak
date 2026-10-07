import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";

const CONTACT = "sarangkumar1578@gmail.com";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
  title: "Privacy Policy",
  description:
    "How Aavedak collects, uses, stores, and deletes your data, including Google user data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="8 October 2026"
      intro={
        <p>
          Aavedak (आवेदक) is a job-search workspace at aavedak.vercel.app. This policy explains what
          data we collect, why, and how you control it.
        </p>
      }
      sections={[
        {
          title: "Data we collect",
          body: (
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Google sign-in:</strong> your name, email address, and profile picture
                (scopes <code>openid</code>, <code>email</code>, <code>profile</code>).
              </li>
              <li>
                <strong>Content you add:</strong> career preferences, resumes (PDF), cover letters,
                templates, job applications, follow-ups, and contacts you enter.
              </li>
              <li>
                <strong>Gmail send (optional):</strong> only if you click &ldquo;Authorize Gmail
                send&rdquo;, we request <code>https://www.googleapis.com/auth/gmail.send</code> and
                store an OAuth refresh token so emails you queued can be sent later.
              </li>
            </ul>
          ),
        },
        {
          title: "How we use Google user data",
          body: (
            <>
              <p>
                Sign-in data identifies your account. The <code>gmail.send</code> permission is used
                solely to send the referral and follow-up emails you compose and confirm in Aavedak,
                from your own Gmail account. Aavedak cannot read, list, modify, or delete your
                existing email.
              </p>
              <p>
                Aavedak&rsquo;s use and transfer of information received from Google APIs adheres to
                the{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. We do not sell Google user data, use it
                for advertising, use it to train AI models, or allow humans to read it except with
                your consent, for security, or as required by law.
              </p>
            </>
          ),
        },
        {
          title: "Storage and sharing",
          body: (
            <p>
              Account and app data are stored in Neon Postgres; resume files in Google Cloud
              Storage; the app runs on Vercel. These processors host data on our behalf. We do not
              share your data with anyone else. People/contact entries you add to the shared
              directory (name, company, public profile links) are visible to other Aavedak users.
            </p>
          ),
        },
        {
          title: "Retention and deletion",
          body: (
            <p>
              Data stays until you delete it. Profile → Danger Zone deletes your account, resumes,
              templates, cover letters, applications, and stored Google tokens. You can also revoke
              Aavedak at{" "}
              <a
                className="text-primary hover:underline"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Account → Third-party access
              </a>
              .
            </p>
          ),
        },
        {
          title: "Contact",
          body: (
            <p>
              Questions or deletion requests:{" "}
              <a className="text-primary hover:underline" href={`mailto:${CONTACT}`}>
                {CONTACT}
              </a>
              . See also our{" "}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
