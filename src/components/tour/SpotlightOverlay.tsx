import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import type { I18nKey } from "@/lib/i18n";

/**
 * Overlay de spotlight compartido por los tutoriales (el tour de la app y el
 * del modal de viaje). Presentacional: recibe pasos e índice, busca el ancla
 * [data-tour] con polling (la página/el modal pueden estar cargando), la
 * ilumina con un recorte y coloca la tarjeta al lado. Si el ancla no aparece
 * o no es visible, la tarjeta se muestra centrada: los pasos NUNCA se pierden.
 */

export type SpotlightStep = {
  id: string;
  /** valor de data-tour del elemento a iluminar; sin target = tarjeta centrada */
  target?: string;
  titleKey: I18nKey;
  bodyKey: I18nKey;
};

const SPOT_PAD = 6;
const CARD_GAP = 20;
const EDGE = 16;
const FIND_TRIES = 30; // ~4s a 130ms
const FIND_INTERVAL_MS = 130;

/** Primer elemento VISIBLE con ese data-tour (puede haber variante móvil y de escritorio). */
function findTarget(target: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of Array.from(els)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

interface SpotlightOverlayProps {
  steps: SpotlightStep[];
  stepIndex: number;
  onStepIndexChange: (index: number) => void;
  onFinish: () => void;
}

export function SpotlightOverlay({ steps, stepIndex, onStepIndexChange, onFinish }: SpotlightOverlayProps) {
  const { t, tf } = useI18n();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Buscar y medir el ancla del paso (con espera).
  useLayoutEffect(() => {
    const step = steps[stepIndex];
    setRect(null); // sin spotlight viejo mientras llega el contenido nuevo
    if (!step?.target) return;

    let cancelled = false;
    let tries = 0;
    let timer: number | undefined;

    const attempt = () => {
      if (cancelled) return;
      const el = findTarget(step.target as string);
      if (el) {
        el.scrollIntoView({ block: "center" });
        setRect(el.getBoundingClientRect());
        return;
      }
      if (tries < FIND_TRIES) {
        tries += 1;
        timer = window.setTimeout(attempt, FIND_INTERVAL_MS);
      }
      // agotado: se queda centrado (rect null) — el paso no se pierde
    };
    attempt();

    const remeasure = () => {
      if (cancelled) return;
      const el = findTarget(step.target as string);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [steps, stepIndex]);

  // Posicionar la tarjeta una vez conocido su tamaño real.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { width: w, height: h } = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) {
      setCardPos({ top: Math.max(EDGE, (vh - h) / 2), left: Math.max(EDGE, (vw - w) / 2) });
      return;
    }
    // Preferencia: a la derecha del elemento; si no cabe, debajo; si no, encima.
    let left = rect.right + SPOT_PAD + CARD_GAP;
    let top = rect.top + rect.height / 2 - h / 2;
    if (left + w > vw - EDGE) {
      left = Math.min(Math.max(EDGE, rect.left + rect.width / 2 - w / 2), vw - w - EDGE);
      top = rect.bottom + SPOT_PAD + CARD_GAP;
      if (top + h > vh - EDGE) top = rect.top - SPOT_PAD - CARD_GAP - h;
    }
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - h - EDGE));
    setCardPos({ top, left });
  }, [rect, stepIndex]);

  // Teclado: Esc cierra, flechas navegan.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
      if (e.key === "ArrowRight") onStepIndexChange(Math.min(stepIndex + 1, steps.length - 1));
      if (e.key === "ArrowLeft") onStepIndexChange(Math.max(stepIndex - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepIndex, steps.length, onFinish, onStepIndexChange]);

  const step = steps[stepIndex];
  if (!step) return null;
  const isLast = stepIndex === steps.length - 1;

  return createPortal(
    // pointer-events-auto explícito: con un Dialog de Radix abierto, el body
    // queda con pointer-events:none y este portal (hijo del body) lo heredaría
    // — los botones del tutorial no recibirían clics.
    <div className="pointer-events-auto fixed inset-0 z-[200] overflow-hidden" role="dialog" aria-modal="true">
      {/* Bloquea la interacción con lo de detrás mientras dura el tutorial */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl border border-primary/60 transition-all duration-300 ease-out"
          style={{
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            boxShadow: "0 0 0 9999px rgba(4, 8, 20, 0.78), 0 0 24px 2px hsl(var(--primary) / 0.25)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/80" />
      )}

      <div
        ref={cardRef}
        className="absolute w-[340px] max-w-[calc(100vw-32px)] rounded-xl border border-border/60 bg-card p-5 shadow-2xl"
        style={{ top: cardPos?.top ?? 0, left: cardPos?.left ?? 0, opacity: cardPos ? 1 : 0 }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {tf("tour.stepOf", { current: stepIndex + 1, total: steps.length })}
        </p>
        <h3 className="mt-1.5 text-base font-semibold text-foreground">{t(step.titleKey)}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(step.bodyKey)}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          {!isLast ? (
            <button
              type="button"
              onClick={onFinish}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("tour.skip")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" type="button" onClick={() => onStepIndexChange(stepIndex - 1)}>
                {t("tour.back")}
              </Button>
            )}
            <Button
              size="sm"
              type="button"
              onClick={() => (isLast ? onFinish() : onStepIndexChange(stepIndex + 1))}
            >
              {isLast ? t("tour.finish") : t("tour.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
