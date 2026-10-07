import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function OnboardingLoading() {
  return (
    <div className="relative overflow-hidden">
      <div className="aavedak-mesh pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="relative">
        <PageLoadingSkeleton variant="form" />
      </div>
    </div>
  );
}
