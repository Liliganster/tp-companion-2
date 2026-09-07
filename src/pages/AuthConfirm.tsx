import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function AuthConfirm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const isValidRequest = Boolean(supabase && tokenHash && type === "recovery");

  const confirmRecovery = async () => {
    if (!supabase || !tokenHash || type !== "recovery" || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (error) throw error;
      navigate("/auth/reset?mode=recovery", { replace: true });
    } catch {
      toast({
        title: "Enlace no válido",
        description: "Solicita un nuevo correo para restablecer tu contraseña.",
        variant: "destructive",
      });
      navigate("/auth", { replace: true });
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
      </div>
    </div>
  );
}
