import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  /** icon = compact mark; full = the supplied square AGFusion brand asset */
  variant?: "icon" | "full";
  className?: string;
  height?: number;
  priority?: boolean;
};

export function BrandLogo({ variant = "icon", className, height = 36, priority = false }: BrandLogoProps) {
  const src = variant === "full" ? "/logo-light.png" : "/icon-180.png";
  const size = Math.max(height, 32);

  return (
    <Image
      src={src}
      alt="AGFusion"
      width={size}
      height={size}
      priority={priority}
      className={cn(
        "object-contain",
        variant === "full" ? "rounded-2xl" : "rounded-xl",
        className,
      )}
      style={{ height, width: height }}
    />
  );
}
