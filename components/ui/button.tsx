import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] border-2 border-border text-sm font-bold whitespace-nowrap select-none outline-none transition-[transform,box-shadow,background-color] [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-md active:translate-x-px active:translate-y-px active:shadow-none",
        outline:
          "bg-card text-card-foreground shadow-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-md active:translate-x-px active:translate-y-px active:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-md active:translate-x-px active:translate-y-px active:shadow-none",
        ghost:
          "border-transparent text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-md active:translate-x-px active:translate-y-px active:shadow-none",
        link: "border-transparent text-foreground underline decoration-primary decoration-2 underline-offset-4 hover:decoration-wavy",
      },
      size: {
        default: "h-10 px-4",
        xs: "h-8 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 px-3 text-[0.8rem]",
        lg: "h-11 px-5 text-base",
        icon: "size-10",
        "icon-xs": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
