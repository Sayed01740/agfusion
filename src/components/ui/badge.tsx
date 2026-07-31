import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "outline" | "cyan";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        variant === "default" &&
          "bg-white/[0.08] text-slate-200 ring-1 ring-white/[0.06]",
        variant === "success" &&
          "bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-400/20",
        variant === "warning" &&
          "bg-amber-500/12 text-amber-200 ring-1 ring-amber-400/25",
        variant === "outline" &&
          "border border-white/12 text-slate-300 bg-transparent",
        variant === "cyan" &&
          "bg-gradient-to-r from-teal-500/15 via-cyan-500/15 to-sky-500/15 text-cyan-100 ring-1 ring-cyan-400/25",
        className,
      )}
      {...props}
    />
  );
}
