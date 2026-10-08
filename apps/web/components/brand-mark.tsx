import Image from "next/image";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

/**
 * Product mark from /public/brand.
 * `unoptimized`: Vercel Services breaks `/_next/image` for local public files
 * (static `/brand/...` works; the optimizer returns 404).
 */
export function BrandMark({
  className,
  alt = "Aavedak — stylized golden A mark",
  width = 96,
  height = 96,
  priority = false,
}: BrandMarkProps) {
  return (
    <Image
      src="/brand/logo-icon.png"
      alt={alt}
      width={width}
      height={height}
      className={cn("aavedak-logo", className)}
      priority={priority}
      unoptimized
    />
  );
}
