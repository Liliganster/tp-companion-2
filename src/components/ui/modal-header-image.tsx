import { cn } from "@/lib/utils";
import tripHeaderImage from "@/assets/trip-modal-header.jpg";

/**
 * Cabecera hero de los modales — el estilo del modal de "Añadir viaje",
 * unificado para TODOS los modales de contenido (pedido de la propietaria
 * 2026-07-11; rediseño 2026-07-19). Va como primer hijo de un DialogContent
 * con `p-0` (el propio DialogContent recorta las esquinas superiores).
 *
 * Con `children` (título/subtítulo) se superponen sobre la imagen abajo a la
 * izquierda, de modo que la cabecera no roba altura extra al contenido. El
 * degradado funde la foto con el color de la tarjeta y una línea azul separa
 * la cabecera del cuerpo.
 */
export function ModalHeaderImage({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-t-2xl", children ? "h-36" : "h-32", className)}>
      <img src={tripHeaderImage} alt="" className="h-full w-full object-cover" />
      {/* Escurecido lateral + fundido hacia la tarjeta para que el texto se lea */}
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-card/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />
      {children && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-6 pb-4 pr-14">
          {children}
        </div>
      )}
      {/* Línea de acento que separa cabecera y cuerpo */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
    </div>
  );
}
