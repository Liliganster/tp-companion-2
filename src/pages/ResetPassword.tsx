import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit =
    !loading &&
    Boolean(user) &&
    nextPassword.trim().length >= 8 &&
    nextPassword === confirm &&
    !busy;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      toast({
        title: "Supabase no configurado",
        description: "Faltan variables de entorno de Supabase.",
        variant: "destructive",
      });
      return;
    }
    if (!user) {
      toast({
        title: "Sesión no encontrada",
        description: "Abre el enlace de recuperación desde tu email.",
        variant: "destructive",
      });
      return;
    }
    if (nextPassword !== confirm) {
      toast({
        title: "Las contraseñas no coinciden",
        variant: "destructive",
      });
      return;
    }
    if (nextPassword.trim().length < 8) {
      toast({
        title: "Contraseña demasiado corta",
        description: "Usa al menos 8 caracteres.",
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword.trim() });
      if (error) throw error;
      toast({
        title: "Contraseña actualizada",
        description: "Ya puedes iniciar sesión con email y contraseña.",
      });
      navigate("/");
    } catch (err: any) {
      toast({
        title: "No se pudo actualizar",
        description: err?.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-card p-6 w-full max-w-md space-y-3">
          <h1 className="text-lg font-semibold">Restablecer contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Abre el enlace de recuperación que te enviamos por email. Si ya lo abriste y llegaste aquí sin sesión, vuelve a intentarlo.
          </p>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline">
              <Link to="/auth">Volver a login</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="glass-card p-6 w-full max-w-md">
        <h1 className="text-xl font-semibold mb-1">Nueva contraseña</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Elige una contraseña nueva para tu cuenta.
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="new-password">Contraseña</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="new-password"
                type="password"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                className="pl-10 bg-secondary/50"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="pl-10 bg-secondary/50"
                autoComplete="new-password"
              />
            </div>
          </div>

          <Button className="w-full" type="submit" disabled={!canSubmit}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
          </Button>
        </form>
      </div>
    </div>
  );
}

