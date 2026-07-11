import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/hooks/use-i18n";
import { supabase } from "@/lib/supabaseClient";
import type { I18nKey } from "@/lib/i18n";

/**
 * Tutorial interactivo (tour con foco tipo spotlight sobre la barra lateral).
 *
 * - Arranca solo UNA vez: la primera sesión del usuario. La marca "visto" se
 *   guarda en user_metadata de Supabase (fb_tour_done, persiste entre
 *   dispositivos) con espejo en localStorage por si la red falla.
 * - Se relanza cuando se quiera con `window.dispatchEvent(new CustomEvent("fb:start-tour"))`
 *   (botones en Ajustes → Ayuda y docs, y en la página /docs).
 * - Los pasos apuntan a elementos con [data-tour="..."]; si uno no es visible
 *   (móvil o zoom alto: la sidebar se oculta bajo lg) el paso NO se pierde:
 *   se muestra como tarjeta centrada sin foco. Siempre son 7 pasos.
 */

type TourStep = {
  id: string;
  /** valor de data-tour del elemento a iluminar; sin target = tarjeta centrada */
  target?: string;
  titleKey: I18nKey;
  bodyKey: I18nKey;
};

const STEPS: TourStep[] = [
  { id: "welcome", titleKey: "tour.welcomeTitle", bodyKey: "tour.welcomeBody" },
  { id: "trips", target: "nav-trips", titleKey: "tour.tripsTitle", bodyKey: "tour.tripsBody" },
  { id: "projects", target: "nav-projects", titleKey: "tour.projectsTitle", bodyKey: "tour.projectsBody" },
  { id: "reports", target: "nav-reports", titleKey: "tour.reportsTitle", bodyKey: "tour.reportsBody" },
  { id: "settings", target: "settings", titleKey: "tour.settingsTitle", bodyKey: "tour.settingsBody" },
  { id: "plan", target: "plan", titleKey: "tour.planTitle", bodyKey: "tour.planBody" },
  { id: "final", titleKey: "tour.finalTitle", bodyKey: "tour.finalBody" },
];

const SPOT_PAD = 6;
const CARD_GAP = 20;
const EDGE = 16;
const AUTO_SESSION_KEY = "fb:tour:auto-checked";

const doneStorageKey = (userId: string) => `fb:tour:done:${userId}`;

function findTarget(target: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return el;
}

export function OnboardingTour() {
  const { user } = useAuth();
  const { t, tf } = useI18n();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const steps = STEPS;

  const start = useCallback(() => {
    setStepIndex(0);
    setCardPos(null);
    setActive(true);
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    if (!user) return;
    try {
      localStorage.setItem(doneStorageKey(user.id), "1");
    } catch {
      /* almacenamiento bloqueado: queda la marca remota */
    }
    // Solo si la marca remota no existe aún (evita una llamada redundante en
    // cada relanzado manual, que además ensucia la consola si se navega justo después).
    if (user.user_metadata?.fb_tour_done !== true) {
      supabase?.auth.updateUser({ data: { fb_tour_done: true } }).catch(() => {
        /* sin red: queda la marca local */
      });
    }
  }, [user]);

  // Relanzado manual desde cualquier parte (Ajustes, Docs).
  useEffect(() => {
    const onStart = () => start();
    window.addEventListener("fb:start-tour", onStart);
    return () => window.removeEventListener("fb:start-tour", onStart);
  }, [start]);

  // Arranque automático: solo la primera vez del usuario (cualquier tamaño de
  // pantalla — los pasos sin ancla visible se muestran centrados).
  useEffect(() => {
    if (!user || active) return;
    if (sessionStorage.getItem(AUTO_SESSION_KEY)) return;
    const doneRemote = user.user_metadata?.fb_tour_done === true;
    let doneLocal = false;
    try {
      doneLocal = localStorage.getItem(doneStorageKey(user.id)) === "1";
    } catch {
      /* ignorar */
    }
    if (doneRemote || doneLocal) return;
    sessionStorage.setItem(AUTO_SESSION_KEY, "1");
    const id = window.setTimeout(start, 1200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- basta con evaluarlo cuando llega el usuario
  }, [user, start]);

  // Medir el elemento objetivo del paso actual (y re-medir en resize/scroll).
  useLayoutEffect(() => {
    if (!active) return;
    const step = steps[stepIndex];
    const measure = () => {
      const el = step?.target ? findTarget(step.target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, steps, stepIndex]);

  // Posicionar la tarjeta una vez conocido su tamaño real.
  useLayoutEffect(() => {
    if (!active) return;
    const card = cardRef.current;
    if (!card) return;
    const { width: w, height: h } = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) {
      setCardPos({ top: Math.max(EDGE, (vh - h) / 2), left: Math.max(EDGE, (vw - w) / 2) });
      return;
    }
    // Preferencia: a la derecha del elemento (la sidebar vive a la izquierda).
    let left = rect.right + SPOT_PAD + CARD_GAP;
    let top = rect.top + rect.height / 2 - h / 2;
    if (left + w > vw - EDGE) {
      // Sin sitio a la derecha: debajo (o encima si tampoco cabe).
      left = Math.min(Math.max(EDGE, rect.left + rect.width / 2 - w / 2), vw - w - EDGE);
      top = rect.bottom + SPOT_PAD + CARD_GAP;
      if (top + h > vh - EDGE) top = rect.top - SPOT_PAD - CARD_GAP - h;
    }
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - h - EDGE));
    setCardPos({ top, left });
  }, [active, rect, stepIndex]);

  // Teclado: Esc cierra, flechas navegan.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setStepIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, steps.length, finish]);

  if (!active || steps.length === 0) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-hidden" role="dialog" aria-modal="true">
      {/* Bloquea la interacción con la app mientras dura el tour */}
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
              onClick={finish}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("tour.skip")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" type="button" onClick={() => setStepIndex((i) => i - 1)}>
                {t("tour.back")}
              </Button>
            )}
            <Button
              size="sm"
              type="button"
              onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
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
