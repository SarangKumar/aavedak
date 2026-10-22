/**
 * The sections of `/{username}/settings`, shared by the page (which reads `?section=`) and
 * the client component (which keeps the URL in sync). One list, so a new section cannot be
 * navigable in the sidebar but unknown to the query parameter.
 */
export const SETTINGS_SECTIONS = [
  "public",
  "links",
  "projects",
  "career",
  "discovery",
  "resume",
  "access",
  "danger",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SETTINGS_SECTION: SettingsSection = "public";

export function isSettingsSection(value: string | null | undefined): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value ?? "");
}

/** The requested section, or the default for anything missing or unknown. */
export function settingsSectionFrom(value: string | null | undefined): SettingsSection {
  return isSettingsSection(value) ? value : DEFAULT_SETTINGS_SECTION;
}

/** Link straight to one section, e.g. `settingsHref("sarang", "discovery")`. */
export function settingsHref(username: string, section?: SettingsSection): string {
  const base = `/${username}/settings`;
  return section && section !== DEFAULT_SETTINGS_SECTION ? `${base}?section=${section}` : base;
}
