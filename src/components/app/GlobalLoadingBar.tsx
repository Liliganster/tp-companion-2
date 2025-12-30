import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export function GlobalLoadingBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const busy = fetching + mutating > 0;

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-0 top-0 z-50 h-1 w-full transition-opacity duration-200",
        busy ? "opacity-100" : "opacity-0",
      )}
      aria-hidden="true"
    >
      <div className="h-full w-full bg-primary/15">
        <div className="h-full w-full bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />
      </div>
    </div>
  );
}

