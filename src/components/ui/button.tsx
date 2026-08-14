import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030712] disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-teal-300 via-cyan-300 to-sky-400 text-slate-950 shadow-[0_8px_28px_rgba(34,211,238,0.28)] hover:shadow-[0_12px_36px_rgba(34,211,238,0.38)] hover:brightness-[1.05]",
        secondary:
          "bg-slate-800/90 text-slate-100 hover:bg-slate-700/95 border border-white/[0.1] shadow-sm shadow-black/20",
        ghost: "hover:bg-white/[0.06] text-slate-200 font-medium",
        outline:
          "border border-cyan-400/35 bg-cyan-400/[0.07] text-cyan-50 hover:bg-cyan-400/14 hover:border-cyan-300/50 shadow-sm shadow-cyan-500/5",
        danger:
          "bg-red-500/15 text-red-200 border border-red-500/30 hover:bg-red-500/25",
      },
      size: {
        default: "h-11 sm:h-10 px-4 py-2",
        sm: "h-10 sm:h-8 rounded-lg px-3 text-xs font-semibold",
        lg: "h-14 sm:h-12 rounded-2xl px-7 text-base font-semibold",
        icon: "h-11 w-11 sm:h-10 sm:w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
