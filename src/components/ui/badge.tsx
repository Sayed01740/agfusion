import { cn } from "@/lib/utils";

export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "success" | "warning" | "danger" | "outline" | "cyan" | "mint" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors",
        variant === "default" && "bg-muted text-foreground ring-1 ring-border",
        variant === "success" && "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
        variant === "warning" && "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
        variant === "danger" && "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
        variant === "outline" && "border border-border text-muted-foreground bg-transparent",
        (variant === "cyan" || variant === "mint") && "bg-accent/15 text-accent ring-1 ring-accent/30",
        className,
      )}
      {...props}
    />
  );
}

