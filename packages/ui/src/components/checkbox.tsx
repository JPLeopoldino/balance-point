"use client";

import { cn } from "@balance-point/ui/lib/utils";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "lucide-react";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // `after:` widens the hit area past the visible box (WCAG 2.5.8) —
        // more generously on touch, where the box itself is also larger.
        "peer relative flex size-5 shrink-0 items-center justify-center rounded-md border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3.5 after:-inset-y-3 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary md:size-4 md:after:-inset-x-3 md:after:-inset-y-2 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-4 md:[&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
