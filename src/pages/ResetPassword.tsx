import { useI18n } from "@/hooks/use-i18n";
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
  const { t } = useI18n();
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
        title: t("ui.supabaseMissing"),
        description: t("ui.supabaseEnvMissing"),
        variant: "destructive",
      });
      return;
    }
    if (!user) {
      toast({
        title: t("ui.sessionMissing"),
        description: t("ui.openRecoveryEmail"),
        variant: "destructive",
      });
      return;
    }
    if (nextPassword !== confirm) {
      toast({
        title: t("ui.passwordMismatch"),
        variant: "destructive",
      });
      return;
    }
    if (nextPassword.trim().length < 8) {
      toast({
        title: t("ui.passwordShort"),
        description: t("ui.passwordMin"),
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

      if (isRecovery && window.location.hostname === "auth.fahrtenbuchpro.com") {
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        if (signOutError) throw signOutError;
        window.location.replace("https://dashboard.fahrtenbuchpro.com/auth?passwordUpdated=1");
        return;
      }

      toast({
        title: t("ui.passwordUpdated"),
        description: t("ui.passwordEmailLogin"),
      });
      navigate("/");
    } catch (err: any) {
      toast({
        title: t("ui.updateFailed"),
        description:
          err?.code === "invalid_credentials" || err?.status === 400
            ? t("ui.checkCurrentPassword")
            : err?.message ?? t("ui.unexpectedError"),
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
          <h1 className="text-lg font-semibold">{t("ui.resetPassword")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("ui.recoverySessionHint")}
          </p>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline">
              <Link to="/auth">{t("ui.backLogin2")}</Link>
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
          <h1 className="text-lg font-semibold">{t("ui.verificationNeeded")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("ui.startSecureChange")}
          </p>
          <Button asChild variant="outline">
            <Link to="/">{t("ui.backDashboard")}</Link>
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
          title: t("ui.secureLinkSent"),
          description: t("ui.openSecureEmail"),
        });
      } catch {
        toast({
          title: t("ui.linkSendFailed"),
          description: t("ui.retryLater"),
          variant: "destructive",
        });
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-card p-6 w-full max-w-md space-y-4">
          <h1 className="text-xl font-semibold">{t("ui.setPassword")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("ui.externalAccount")}
          </p>
          <Button className="w-full" type="button" disabled={busy || !user.email} onClick={sendSecureLink}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("ui.sendSecureLink")}
          </Button>
          <Button asChild className="w-full" variant="outline">
            <Link to="/">{t("ui.backDashboard")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="glass-card p-6 w-full max-w-md">
        <h1 className="text-xl font-semibold mb-1">{t("ui.newPassword")}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {t("ui.choosePassword")}
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          {requiresCurrentPassword && (
            <div className="space-y-2">
              <Label htmlFor="current-password">{t("ui.currentPassword")}</Label>
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
            <Label htmlFor="new-password">{t("ui.password")}</Label>
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
            <Label htmlFor="confirm-password">{t("ui.confirmPassword")}</Label>
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
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("ui.save")}
          </Button>
        </form>
      </div>
    </div>
  );
}
