import { cn } from "@/lib/utils";
import tripHeaderImage from "@/assets/trip-modal-header.jpg";

/**
 * Cabecera con imagen + degradado de los modales — el estilo del modal de
 * "Añadir viaje", unificado para TODOS los modales de contenido (pedido de
 * la propietaria 2026-07-11). Va como primer hijo de un DialogContent con
 * `p-0` (el propio DialogContent recorta las esquinas superiores).
 */
export function ModalHeaderImage({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-32 shrink-0 overflow-hidden rounded-t-lg", className)}>
      <img src={tripHeaderImage} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
    </div>
  );
}
