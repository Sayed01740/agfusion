import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07090d] disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-b from-slate-100 to-slate-300 text-slate-950 border border-white/70 shadow-[0_10px_28px_rgba(0,0,0,0.28)] hover:from-white hover:to-slate-200 hover:shadow-[0_14px_34px_rgba(0,0,0,0.34)]",
        secondary: "bg-slate-800/90 text-slate-100 hover:bg-slate-700/95 border border-white/[0.1] shadow-sm shadow-black/20",
        ghost: "hover:bg-white/[0.06] text-slate-200 font-medium",
        outline: "border border-white/[0.13] bg-white/[0.025] text-slate-100 hover:bg-white/[0.07] hover:border-white/[0.2] shadow-sm shadow-black/15",
        danger: "bg-red-500/15 text-red-200 border border-red-500/30 hover:bg-red-500/25",
      },
      size: {
        default: "h-11 sm:h-10 px-4 py-2",
        sm: "h-10 sm:h-8 rounded-lg px-3 text-xs font-semibold",
        lg: "h-12 sm:h-11 rounded-xl px-6 text-sm font-semibold",
        icon: "h-11 w-11 sm:h-10 sm:w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
