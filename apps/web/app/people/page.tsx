import type { Metadata } from "next";

import { PeopleHub } from "@/components/people-hub";
import { requireOnboarded } from "@/lib/app-access";
import { listApplications } from "@/lib/applications";
import { getVoteSummaries, listPeople, NO_VOTES } from "@/lib/people";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "People",
  description: "Contacts for warm intros and cold outreach.",
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "Pune, India" from discovery's parsed city + ISO country; null when neither is known. */
function personLocationLabel(city: string | null, countryCode: string | null): string | null {
  let country: string | null = null;
  if (countryCode) {
    try {
      country = regionNames.of(countryCode.toUpperCase()) ?? countryCode;
    } catch {
      country = countryCode;
    }
  }
  const parts = [city, country].filter((v): v is string => Boolean(v));
  return parts.length ? [...new Set(parts)].join(", ") : null;
}

export default async function PeoplePage() {
  const { user } = await requireOnboarded();
  const [people, applications] = await Promise.all([
    listPeople({ includeArchived: true }),
    listApplications(user.id, "active"),
  ]);
  const votes = await getVoteSummaries(
    user.id,
    people.map((p) => p.id),
  );

  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative">
        <PeopleHub
          initialPeople={people.map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            company: p.company,
            roleTitle: p.roleTitle,
            notes: p.notes,
            applicationId: p.applicationId,
            status: p.status,
            origin: p.origin,
            linkedin: p.linkedin ? `https://www.${p.linkedin}` : null,
            githubUrl: p.githubUrl,
            location: personLocationLabel(p.locationCity, p.countryCode),
            discoverySource: p.discoverySource,
            confidence: p.confidence,
            inferredEmail: p.inferredEmail,
            inferredEmailConfidence: p.inferredEmailConfidence,
            votes: votes.get(p.id) ?? NO_VOTES,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          }))}
          applications={applications.map((a) => ({
            id: a.id,
            companyName: a.companyName,
            role: a.role,
          }))}
        />
      </div>
    </div>
  );
}
