import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  /** icon = square mark; full = logo + wordmark asset */
  variant?: "icon" | "full";
  className?: string;
  /** Image height in px (width scales with aspect) */
  height?: number;
  priority?: boolean;
};

/**
 * Uses assets from /public:
 * - logo-light.png / icon-180.png — full brand (dark bg)
 * - icon-32.png — tiny tab icon fallback
 */
export function BrandLogo({
  variant = "icon",
  className,
  height = 36,
  priority = false,
}: BrandLogoProps) {
  if (variant === "full") {
    // Square full-brand asset; height drives display size
    const size = Math.max(height, 40);
    return (
      <Image
        src="/logo-light.png"
        alt="AGFusion"
        width={size}
        height={size}
        priority={priority}
        className={cn("rounded-xl object-contain", className)}
        style={{ height, width: height }}
      />
    );
  }

  return (
    <Image
      src="/icon-180.png"
      alt="AGFusion"
      width={height}
      height={height}
      priority={priority}
      className={cn(
        "rounded-xl object-contain ring-1 ring-white/10 shadow-lg shadow-cyan-500/20",
        className,
      )}
      style={{ height, width: height }}
    />
  );
}
