import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  /** icon = compact fusion mark; full = master AGFusion lockup */
  variant?: "icon" | "full";
  className?: string;
  height?: number;
  priority?: boolean;
};

export function BrandLogo({
  variant = "icon",
  className,
  height = 36,
  priority = false,
}: BrandLogoProps) {
  const src = variant === "full" ? "/brand/agfusion-main.svg" : "/brand/agfusion-mark.svg";
  const width = variant === "full" ? Math.round(height * 1.67) : height;

  return (
    <Image
      src={src}
      alt="AGFusion"
      width={width}
      height={height}
      priority={priority}
      className={cn("object-contain", className)}
      style={{ height, width: variant === "full" ? "auto" : height }}
    />
  );
}
