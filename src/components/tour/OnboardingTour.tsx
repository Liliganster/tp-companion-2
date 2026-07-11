import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { SpotlightOverlay, type SpotlightStep } from "@/components/tour/SpotlightOverlay";

/**
 * Tutorial interactivo — visita GUIADA por la app, no un pop-up estático:
 * cada paso navega a la página real (panel → viajes → proyectos → informes →
 * calendario) e ilumina el control concreto con un spotlight (SpotlightOverlay).
 *
 * - Vive en ProtectedLayout (App.tsx): sobrevive a la navegación entre rutas.
 * - Arranca solo UNA vez (primera sesión del usuario). Marca "visto" en
 *   user_metadata.fb_tour_done de Supabase + espejo en localStorage.
 * - Se relanza con `window.dispatchEvent(new CustomEvent("fb:start-tour"))`
 *   (Ajustes → Ayuda y docs, y la página /docs).
 */

type TourStep = SpotlightStep & {
  /** ruta a la que navegar antes de mostrar el paso (si no estamos ya en ella) */
  route?: string;
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

const AUTO_SESSION_KEY = "fb:tour:auto-checked";
const doneStorageKey = (userId: string) => `fb:tour:done:${userId}`;

export function OnboardingTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const start = useCallback(() => {
    setStepIndex(0);
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
    const step = STEPS[stepIndex];
    if (step?.route && location.pathname !== step.route) {
      navigate(step.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- location solo se lee; navegar de nuevo al cambiar sería un bucle
  }, [active, stepIndex, navigate]);

  if (!active) return null;

  return (
    <SpotlightOverlay
      steps={STEPS}
      stepIndex={stepIndex}
      onStepIndexChange={setStepIndex}
      onFinish={finish}
    />
  );
}
