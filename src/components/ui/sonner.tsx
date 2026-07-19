import { Toaster as Sonner, toast } from "sonner";
import { useEffect, useState } from "react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * ÚNICO sistema de toasts de la app (sonner). El hook use-toast es un
 * adaptador de compatibilidad que también desemboca aquí.
 *
 * theme="dark" FIJO: la app es oscura siempre (decisión de la propietaria) y
 * no hay ThemeProvider de next-themes — con theme="system" los toasts salían
 * BLANCOS en máquinas con modo claro del SO (el bug de "toasts feos").
 * Estilo Unity: tarjeta carbón elevada, borde sutil, radio 12px, iconos con
 * color semántico (verde/rojo/ámbar/azul).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 768); // md breakpoint
    };

    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  return (
    <Sonner
      theme="dark"
      position={isDesktop ? "bottom-right" : "top-center"}
      visibleToasts={isDesktop ? 5 : 1}
      expand={true}
      closeButton
      duration={5000}
      offset={isDesktop ? "16px" : undefined}
      gap={12}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-white/10 group-[.toaster]:rounded-xl group-[.toaster]:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.7)]",
          title: "group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:font-medium",
          cancelButton:
            "group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground group-[.toast]:rounded-lg",
          closeButton:
            "group-[.toast]:bg-card group-[.toast]:text-muted-foreground group-[.toast]:border-white/10 group-[.toast]:hover:bg-secondary group-[.toast]:hover:text-foreground",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-primary",
          loading: "[&_[data-icon]]:text-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
