import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Keeps optional fields mounted so toggling a section never discards a draft. */
export function FormSection({ title, children, reveal = false }: { title: ReactNode; children: ReactNode; reveal?: boolean }) {
  const [open, setOpen] = useState(reveal);
  useEffect(() => { if (reveal) setOpen(true); }, [reveal]);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="group rounded-xl border border-border">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      {title}<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>
    <div className="space-y-4 border-t border-border px-4 py-4">{children}</div>
  </details>;
}
