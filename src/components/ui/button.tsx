import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-tight transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45 cursor-pointer motion-reduce:transition-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 text-slate-950 font-bold hover:brightness-110 shadow-[0_4px_20px_rgba(5,242,155,0.3)] hover:shadow-[0_4px_28px_rgba(5,242,155,0.45)] border border-emerald-300/30 hover:scale-[1.01] active:scale-[0.98]",
        secondary: "bg-[#0e1722] text-slate-100 hover:bg-[#14202e] border border-white/[0.08] shadow-sm hover:border-white/20",
        ghost: "hover:bg-white/[0.06] text-slate-300 hover:text-slate-50 font-medium",
        outline: "border border-white/[0.1] bg-[#0c1219]/90 text-slate-200 hover:bg-emerald-500/[0.08] hover:border-emerald-400/40 hover:text-emerald-300 shadow-sm",
        danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
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
