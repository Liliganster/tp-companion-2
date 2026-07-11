import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/hooks/use-i18n";
import { supabase } from "@/lib/supabaseClient";
import type { I18nKey } from "@/lib/i18n";

/**
 * Tutorial interactivo — visita GUIADA por la app, no un pop-up estático:
 * cada paso navega a la página real (panel → viajes → proyectos → informes →
 * calendario) e ilumina el control concreto con un spotlight.
 *
 * - Vive en ProtectedLayout (App.tsx): sobrevive a la navegación entre rutas.
 * - Arranca solo UNA vez (primera sesión del usuario). Marca "visto" en
 *   user_metadata.fb_tour_done de Supabase + espejo en localStorage.
 * - Se relanza con `window.dispatchEvent(new CustomEvent("fb:start-tour"))`
 *   (Ajustes → Ayuda y docs, y la página /docs).
 * - Anclas por [data-tour="..."]; tras navegar se espera (polling ~4s) a que
 *   el ancla exista. Si no aparece o no es visible (móvil), el paso se
 *   muestra centrado con el mismo contenido: NUNCA se pierden pasos.
 */

type TourStep = {
  id: string;
  /** ruta a la que navegar antes de mostrar el paso (si no estamos ya en ella) */
  route?: string;
  /** valor de data-tour del elemento a iluminar; sin target = tarjeta centrada */
  target?: string;
  titleKey: I18nKey;
  bodyKey: I18nKey;
};

const STEPS: TourStep[] = [
  { id: "welcome", route: "/", titleKey: "tour.welcomeTitle", bodyKey: "tour.welcomeBody" },
  { id: "kpis", route: "/", target: "kpis", titleKey: "tour.kpisTitle", bodyKey: "tour.kpisBody" },
  { id: "attention", route: "/", target: "attention", titleKey: "tour.attentionTitle", bodyKey: "tour.attentionBody" },
  { id: "add-trip", route: "/trips", target: "add-trip", titleKey: "tour.addTripTitle", bodyKey: "tour.addTripBody" },
  { id: "bulk", route: "/trips", target: "bulk-upload", titleKey: "tour.bulkTitle", bodyKey: "tour.bulkBody" },
  { id: "table", route: "/trips", target: "trips-filters", titleKey: "tour.tableTitle", bodyKey: "tour.tableBody" },
  { id: "projects", route: "/projects", target: "new-project", titleKey: "tour.projectsTitle", bodyKey: "tour.projectsBody" },
  { id: "reports", route: "/reports", target: "report-generate", titleKey: "tour.reportsTitle", bodyKey: "tour.reportsBody" },
  { id: "calendar", route: "/calendar", target: "calendar-header", titleKey: "tour.calendarTitle", bodyKey: "tour.calendarBody" },
  { id: "settings", target: "settings", titleKey: "tour.settingsTitle", bodyKey: "tour.settingsBody" },
  { id: "plan", target: "plan", titleKey: "tour.planTitle", bodyKey: "tour.planBody" },
  { id: "final", titleKey: "tour.finalTitle", bodyKey: "tour.finalBody" },
];

const SPOT_PAD = 6;
const CARD_GAP = 20;
const EDGE = 16;
const FIND_TRIES = 30; // ~4s a 130ms: cubre el lazy-load de la página tras navegar
const FIND_INTERVAL_MS = 130;
const AUTO_SESSION_KEY = "fb:tour:auto-checked";

const doneStorageKey = (userId: string) => `fb:tour:done:${userId}`;

/** Primer elemento VISIBLE con ese data-tour (puede haber variante móvil y de escritorio). */
function findTarget(target: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of Array.from(els)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function OnboardingTour() {
  const { user } = useAuth();
  const { t, tf } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const steps = STEPS;

  const start = useCallback(() => {
    setStepIndex(0);
    setRect(null);
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

  // Arranque automático: solo la primera vez del usuario.
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

  // Navegar a la página del paso actual (la visita guiada de verdad).
  useEffect(() => {
    if (!active) return;
    const step = steps[stepIndex];
    if (step?.route && location.pathname !== step.route) {
      navigate(step.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- location solo se lee; navegar de nuevo al cambiar sería un bucle
  }, [active, stepIndex, steps, navigate]);

  // Buscar y medir el ancla del paso (con espera: la página puede estar cargando).
  useLayoutEffect(() => {
    if (!active) return;
    const step = steps[stepIndex];
    setRect(null); // sin spotlight viejo mientras llega la página nueva
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
