import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { navigateToRecoveryForm } from "@/lib/recoveryNavigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const RECOVERY_TIMEOUT_MS = 15_000;

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("RECOVERY_TIMEOUT")), RECOVERY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default function AuthConfirm() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const isValidRequest = Boolean(supabase && tokenHash && type === "recovery");

  const confirmRecovery = async () => {
    if (!supabase || !tokenHash || type !== "recovery" || busy) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }),
      );
      if (error) throw error;
      if (!data.session) throw new Error("RECOVERY_SESSION_MISSING");

      // A full navigation makes the freshly persisted recovery session available
      // before ResetPassword renders, avoiding a race with AuthContext.
      navigateToRecoveryForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const description =
        message === "RECOVERY_TIMEOUT"
          ? "La verificación está tardando demasiado. Comprueba tu conexión e inténtalo de nuevo."
          : /expired|invalid|otp_expired/i.test(message)
            ? "Este enlace ha caducado o ya fue utilizado. Solicita un nuevo correo de recuperación."
            : "No se pudo verificar el enlace. Solicita un nuevo correo de recuperación.";

      setErrorMessage(description);
      toast({
        title: "Enlace no válido",
        description,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!isValidRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="glass-card p-6 w-full max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">Enlace no válido</h1>
          <p className="text-sm text-muted-foreground">Solicita un nuevo correo para restablecer tu contraseña.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth">Volver al login</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="glass-card p-6 w-full max-w-md space-y-4 text-center">
        <ShieldCheck className="w-10 h-10 text-primary mx-auto" />
        <h1 className="text-xl font-semibold">Restablecimiento seguro</h1>
        <p className="text-sm text-muted-foreground">
          Confirma que quieres continuar para crear una nueva contraseña de Fahrtenbuch Pro.
        </p>
        <Button type="button" className="w-full" disabled={busy} onClick={confirmRecovery}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continuar de forma segura"}
        </Button>
        {errorMessage && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-left">
            <p className="text-sm text-destructive">{errorMessage}</p>
            <a
              className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
              href="https://dashboard.fahrtenbuchpro.com/auth"
            >
              Solicitar otro enlace
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
