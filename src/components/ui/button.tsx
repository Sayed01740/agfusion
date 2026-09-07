import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-tight transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45 cursor-pointer motion-reduce:transition-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground border border-accent hover:brightness-110 shadow-sm shadow-accent/20 hover:shadow-accent/30",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted border border-border",
        ghost: "hover:bg-muted text-foreground font-medium",
        outline: "border border-border bg-card text-foreground hover:bg-muted hover:border-accent/40",
        danger: "bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20",
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
