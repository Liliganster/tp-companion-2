import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, requestPasswordReset } = useAuth();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const mode = searchParams.get("mode");
  const isRecovery = mode === "recovery";
  const isAccountChange = mode === "change";
  const providers = Array.isArray(user?.app_metadata?.providers)
    ? (user.app_metadata.providers as string[])
    : [];
  const hasEmailPassword =
    user?.identities?.some((identity) => identity.provider === "email") ||
    providers.includes("email");
  const requiresCurrentPassword = isAccountChange && hasEmailPassword;

  const canSubmit =
    !loading &&
    Boolean(user) &&
    (isRecovery || requiresCurrentPassword) &&
    (!requiresCurrentPassword || currentPassword.length > 0) &&
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
      const attributes = isRecovery
        ? { password: nextPassword }
        : {
            email: user.email,
            current_password: currentPassword,
            password: nextPassword,
          };
      const { error } = await supabase.auth.updateUser(attributes);
      if (error) throw error;
      toast({
        title: "Contraseña actualizada",
        description: "Ya puedes iniciar sesión con email y contraseña.",
      });
      navigate("/");
    } catch (err: any) {
      toast({
        title: "No se pudo actualizar",
        description:
          err?.code === "invalid_credentials" || err?.status === 400
            ? "Comprueba tu contraseña actual e inténtalo de nuevo."
            : err?.message ?? "Error inesperado",
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

  if (!isRecovery && !isAccountChange) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-card p-6 w-full max-w-md space-y-3">
          <h1 className="text-lg font-semibold">Verificación necesaria</h1>
          <p className="text-sm text-muted-foreground">
            Inicia el cambio desde Ajustes o utiliza el enlace seguro enviado a tu correo.
          </p>
          <Button asChild variant="outline">
            <Link to="/">Volver al panel</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isAccountChange && !hasEmailPassword) {
    const sendSecureLink = async () => {
      if (!user.email) return;
      setBusy(true);
      try {
        await requestPasswordReset(user.email);
        toast({
          title: "Enlace de seguridad enviado",
          description: "Abre el correo para establecer una contraseña de forma segura.",
        });
      } catch {
        toast({
          title: "No se pudo enviar el enlace",
          description: "Espera unos minutos e inténtalo de nuevo.",
          variant: "destructive",
        });
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-card p-6 w-full max-w-md space-y-4">
          <h1 className="text-xl font-semibold">Establecer contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Tu cuenta utiliza un proveedor externo. Para protegerla, te enviaremos un enlace de un solo uso a tu correo verificado.
          </p>
          <Button className="w-full" type="button" disabled={busy || !user.email} onClick={sendSecureLink}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar enlace seguro"}
          </Button>
          <Button asChild className="w-full" variant="outline">
            <Link to="/">Volver al panel</Link>
          </Button>
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
          {requiresCurrentPassword && (
            <div className="space-y-2">
              <Label htmlFor="current-password">Contraseña actual</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="current-password"
                  name="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pl-10"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">Contraseña</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="new-password"
                name="new-password"
                type={showPassword ? "text" : "password"}
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                className="pl-10 pr-10"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar contraseña</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="confirm-password"
                name="confirm-password"
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="pl-10 pr-10"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
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
