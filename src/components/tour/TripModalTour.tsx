import { useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { SpotlightOverlay, type SpotlightStep } from "@/components/tour/SpotlightOverlay";
import { useState } from "react";

/**
 * Tutorial del modal de añadir/editar viaje. Existe sobre todo por "Origen
 * especial": la función menos común del formulario y la que la gente no
 * entiende sin explicación (pedido de la propietaria 2026-07-11).
 *
 * - Se auto-muestra UNA vez: la primera vez que el usuario abre el modal.
 *   Marca en user_metadata.fb_trip_tour_done + espejo en localStorage.
 * - Relanzable con el botón de ayuda (?) de la cabecera del modal.
 * - Mientras está activo, AddTripModal bloquea el cierre del Dialog por
 *   Escape/clic fuera (el overlay vive fuera del DialogContent).
 */

const STEPS: SpotlightStep[] = [
  { id: "route", target: "trip-route", titleKey: "tripTour.routeTitle", bodyKey: "tripTour.routeBody" },
  { id: "origin-mode", target: "trip-origin-mode", titleKey: "tripTour.originModeTitle", bodyKey: "tripTour.originModeBody" },
  { id: "distance", target: "trip-distance", titleKey: "tripTour.distanceTitle", bodyKey: "tripTour.distanceBody" },
  { id: "passengers", target: "trip-passengers", titleKey: "tripTour.passengersTitle", bodyKey: "tripTour.passengersBody" },
  { id: "expenses", target: "trip-expenses", titleKey: "tripTour.expensesTitle", bodyKey: "tripTour.expensesBody" },
];

const doneStorageKey = (userId: string) => `fb:tour:trip:done:${userId}`;

/** ¿Toca auto-mostrar el tutorial del modal a este usuario? */
export function shouldAutoShowTripTour(user: User | null): boolean {
  if (!user) return false;
  if (user.user_metadata?.fb_trip_tour_done === true) return false;
  try {
    if (localStorage.getItem(doneStorageKey(user.id)) === "1") return false;
  } catch {
    /* ignorar */
  }
  return true;
}

interface TripModalTourProps {
  active: boolean;
  onClose: () => void;
  user: User | null;
}

export function TripModalTour({ active, onClose, user }: TripModalTourProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const finish = useCallback(() => {
    setStepIndex(0);
    onClose();
    if (!user) return;
    try {
      localStorage.setItem(doneStorageKey(user.id), "1");
    } catch {
      /* almacenamiento bloqueado: queda la marca remota */
    }
    if (user.user_metadata?.fb_trip_tour_done !== true) {
      supabase?.auth.updateUser({ data: { fb_trip_tour_done: true } }).catch(() => {
        /* sin red: queda la marca local */
      });
    }
  }, [onClose, user]);

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
