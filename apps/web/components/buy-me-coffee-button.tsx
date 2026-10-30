import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BUY_ME_COFFEE } from "@/lib/site-links";

/**
 * Labeled Buy me a coffee control — mug icon + exact label, opens BMC in a
 * new tab. Styled with buttonVariants so it matches the rest of the site.
 */
export function BuyMeCoffeeButton({
  className,
  size = "sm",
  variant = "outline",
}: {
  className?: string;
  size?: "default" | "xs" | "sm" | "lg";
  variant?: "default" | "outline" | "ghost" | "secondary" | "link";
}) {
  return (
    <a
      href={BUY_ME_COFFEE.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant, size }), "gap-2", className)}
      aria-label={BUY_ME_COFFEE.label}
    >
      {/* Static brand mug — next/image not needed for a tiny fixed asset */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BUY_ME_COFFEE.iconSrc}
        alt=""
        width={14}
        height={20}
        className="h-3.5 w-auto"
        decoding="async"
      />
      <span>Buy me a coffee</span>
    </a>
  );
}
