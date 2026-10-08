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
                templates, job applications, follow-ups, and people/contacts you enter.
              </li>
              <li>
                <strong>Shared people directory:</strong> when you add a person (name, email,
                company, role, notes, and related contact fields), that entry is contributed to
                Aavedak&rsquo;s global shared directory and may be visible to other users of the
                website worldwide.
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
            <>
              <p>
                Account and app data are stored in Neon Postgres; resume files in Google Cloud
                Storage; the app runs on Vercel. These processors host data on our behalf. We do not
                sell your personal account data.
              </p>
              <p>
                <strong>People you add are shared globally.</strong> Contact entries you create in
                People / Referrals are contributed to a website-wide directory. Other Aavedak users
                may see and use that contributed people data (for example name, company, role, and
                contact details you entered). Do not add anyone you are not comfortable contributing
                to this shared directory.
              </p>
            </>
          ),
        },
        {
          title: "Retention and deletion",
          body: (
            <>
              <p>
                Personal account data stays until you delete it. Profile → Danger Zone deletes your
                account, resumes, templates, cover letters, applications, follow-ups tied to you, and
                stored Google tokens. You can also revoke Aavedak at{" "}
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
              <p>
                <strong>Deleting your account may not delete people you added.</strong> Because
                people entries are contributed to the global shared directory, they may remain
                available to other users after your account is deleted. Your private ownership link
                to those records is removed, but the shared contact data itself is not guaranteed to
                be erased. Contact us if you need a specific shared-person entry reviewed for
                removal.
              </p>
            </>
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
