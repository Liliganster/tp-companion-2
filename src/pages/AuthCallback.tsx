import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    if (!supabase) {
      navigate("/auth");
      return;
    }

    const href = window.location.href;
    const url = new URL(href);
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error");
    const oauthErrorDescription = url.searchParams.get("error_description");
    const isRecoveryUrl = href.includes("type=recovery");
    const hasImplicitTokens = window.location.hash.includes("access_token=");

    // Listen for Auth events (most reliable for PKCE)
    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/auth/reset");
      } else if (event === "SIGNED_IN") {
        // If we found the recovery flag in URL, prefer that over generic sign-in
        if (isRecoveryUrl) {
          navigate("/auth/reset");
        } else {
          navigate("/");
        }
      }
    });
    
    const run = async () => {
      if (oauthError) {
        toast.error("Error de autenticación", { description: oauthErrorDescription ?? oauthError });
        navigate("/auth");
        return;
      }

      // Manually handle session recovery in this route (we disabled detectSessionInUrl globally).
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (hasImplicitTokens) {
          // Gotrue warns if the device clock is behind even by ~1s; a short delay prevents false positives.
          await sleep(1200);
          const { error } = await (supabase.auth as any).getSessionFromUrl?.({ storeSession: true });
          if (error) throw error;
        } else {
          toast.error("No se recibió respuesta de Google", { description: "Vuelve a intentarlo desde la pantalla de acceso." });
          navigate("/auth");
          return;
        }
      } catch {
        toast.error("No se pudo completar el inicio de sesión", { description: "Revisa la configuración de Google en Supabase." });
        navigate("/auth");
        return;
      } finally {
        // Remove auth artifacts from the URL to avoid reprocessing on refresh.
        try {
          window.history.replaceState({}, document.title, url.pathname);
        } catch {
          // ignore
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) {
        toast.error("Sesión no válida", { description: "No se pudo recuperar la sesión tras el login." });
        navigate("/auth");
        return;
      }

      // If no event fired (race), navigate based on URL flags.
      if (isRecoveryUrl) navigate("/auth/reset");
      else navigate("/");
    };

    void run();

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Verifying authentication...</p>
      </div>
    </div>
  );
}
