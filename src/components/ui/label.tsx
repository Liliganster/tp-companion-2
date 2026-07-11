import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Etiquetas en gris discreto (estilo Unity); el valor va en blanco en el campo
const labelVariants = cva("text-sm font-medium leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70");

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
