import type { ReactNode } from "react";

/**
 * Botón "Cargar más" estilo Unity: píldora oscura centrada bajo la tabla.
 * Un solo estilo para todas las listas paginadas de la app.
 */
export function LoadMoreButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <div className="flex justify-center py-5">
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl border border-border/40 bg-background px-8 py-3 text-sm font-semibold text-foreground shadow-lg transition-colors hover:bg-accent"
      >
        {children}
      </button>
    </div>
  );
}
