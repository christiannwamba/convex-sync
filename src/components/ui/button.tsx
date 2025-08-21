import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-none text-sm font-base ring-offset-background transition-all gap-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "text-primary-foreground bg-primary border-2 border-border shadow-shadow hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground border-2 border-border shadow-shadow hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
        outline:
          "border-2 border-border bg-background shadow-shadow hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground border-2 border-border shadow-shadow hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
        ghost:
          "hover:bg-accent hover:text-accent-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
        noShadow: 
          "text-primary-foreground bg-primary border-2 border-border",
        neutral:
          "bg-secondary text-secondary-foreground border-2 border-border shadow-shadow hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
