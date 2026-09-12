import { cn } from "@/lib/utils";

/** Compact shared modal heading. The export name is retained for existing callers. */
export function ModalHeaderImage({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn(className, "flex h-auto min-h-16 shrink-0 flex-col justify-center gap-1 border-b border-border px-5 py-4 pr-16 sm:h-auto sm:px-6 sm:pr-16")}>
    {children}
  </div>;
}
