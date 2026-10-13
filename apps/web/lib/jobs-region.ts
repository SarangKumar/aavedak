/** Jobs page region view (`?region=`): India first (default; everything, Indian and
 *  India-open remote roles on top), India only (India + remote open to India), outside
 *  India, or all regions by date. Shared by the server loader and the client board. */
export type JobsRegionView = "india-first" | "india" | "outside" | "all";

export const JOBS_REGION_VIEWS: Array<{ value: JobsRegionView; label: string }> = [
  { value: "india-first", label: "India first" },
  { value: "india", label: "India only" },
  { value: "outside", label: "Outside India" },
  { value: "all", label: "All regions" },
];

export function parseJobsRegionView(value: string | undefined): JobsRegionView {
  return JOBS_REGION_VIEWS.find((r) => r.value === value)?.value ?? "india-first";
}
