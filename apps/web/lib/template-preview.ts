/** Client-safe cold-email template preview helpers (dummy application). */

export type TemplatePreviewVar = {
  key: string;
  label: string;
  description: string;
};

export const TEMPLATE_PREVIEW_VAR_DOCS: TemplatePreviewVar[] = [
  {
    key: "company",
    label: "Company",
    description: "Job application company name from the dummy strip.",
  },
  {
    key: "role",
    label: "Role",
    description: "Job title / role on the dummy application.",
  },
  {
    key: "location",
    label: "Location",
    description: "Job location on the dummy application.",
  },
  {
    key: "person_name",
    label: "Person name",
    description: "Sample outreach recipient full name.",
  },
  {
    key: "person_email",
    label: "Person email",
    description: "Sample outreach recipient email.",
  },
  {
    key: "user_name",
    label: "Your name",
    description: "Sender display name (you / signed-in user).",
  },
  {
    key: "from_email",
    label: "From email",
    description: "Sender Gmail / signed-in email used as From.",
  },
];

export type DummyApplication = {
  company: string;
  role: string;
  location: string;
  personName: string;
  personEmail: string;
  userName: string;
  fromEmail: string;
};

export const DEFAULT_DUMMY_APPLICATION: DummyApplication = {
  company: "Acme Corp",
  role: "Software Engineer",
  location: "Remote",
  personName: "John Doe",
  personEmail: "example@email.com",
  userName: "John Doe",
  fromEmail: "example@email.com",
};

export function dummyApplicationToVars(dummy: DummyApplication): Record<string, string> {
  return {
    company: dummy.company,
    role: dummy.role,
    location: dummy.location,
    person_name: dummy.personName,
    person_email: dummy.personEmail,
    user_name: dummy.userName,
    from_email: dummy.fromEmail,
  };
}

export function renderTemplatePreview(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return vars[key] ?? "";
  });
}

export const DEFAULT_TEMPLATE_SUBJECT = "Referral ask — {{role}} at {{company}}";
