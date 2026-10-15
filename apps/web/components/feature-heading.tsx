import { FEATURES, type FeatureKey } from "@/lib/features";
import { cn } from "@/lib/utils";

/** Page h1 with the feature's shared icon and label (lib/features). */
export function FeatureHeading({
  feature,
  className,
}: {
  feature: FeatureKey;
  className?: string;
}) {
  const f = FEATURES[feature];
  return (
    <h1
      className={cn(
        "aavedak-display text-foreground flex items-center gap-2 text-2xl sm:text-3xl",
        className,
      )}
    >
      <f.icon className="text-primary size-5 shrink-0" aria-hidden strokeWidth={1.75} />
      {f.label}
    </h1>
  );
}

/** Small icon for a card/section header, from the shared feature map. */
export function FeatureIcon({ feature, className }: { feature: FeatureKey; className?: string }) {
  const Icon = FEATURES[feature].icon;
  return <Icon className={cn("text-muted-foreground size-4 shrink-0", className)} aria-hidden />;
}
