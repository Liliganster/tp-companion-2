import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, Check } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import tripHeaderImage from "@/assets/trip-modal-header.jpg";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { logger } from "@/lib/logger";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export default function Auth() {
  const { t } = useI18n();
  const { signInWithPassword, signUpWithPassword, signInWithGoogle, requestPasswordReset, user, loading } = useAuth();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [showVerifyEmailNotice, setShowVerifyEmailNotice] = useState(false);
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!isLoading && !loading && user) {
      navigate("/");
    }
  }, [user, loading, isLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setShowVerifyEmailNotice(false);
    try {
      if (isLogin) {
        await signInWithPassword(email, password);
      } else {
        await signUpWithPassword(email, password, name);
        setIsLogin(true);
        setPassword("");
        setShowVerifyEmailNotice(true);
      }
    } catch (err: any) {
      const message = String(err?.message ?? "");
      const isInvalidLogin = message.toLowerCase().includes("invalid login credentials");
      toast({
        title: isInvalidLogin ? "Credenciales incorrectas" : "Auth error",
        description: isInvalidLogin ? "Email o contraseña incorrectos." : err?.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast({
        title: "Introduce tu email",
        description: "Escribe tu email arriba para enviarte un enlace de recuperación.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await requestPasswordReset(cleanEmail);
      toast({
        title: "Email enviado",
        description: "Revisa tu bandeja de entrada para restablecer la contraseña.",
      });
    } catch (err: any) {
      logger.warn("Password reset error", err);
      toast({
        title: "No se pudo enviar",
        description: err?.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = useCallback(async (idToken: string, nonce: string) => {
    setIsLoading(true);
    try {
      await signInWithGoogle(idToken, nonce);
    } catch (err: any) {
      toast({
        title: "No se pudo iniciar sesión con Google",
        description: err?.message ?? "Revisa la configuración del proveedor en Supabase/Google.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }, [signInWithGoogle, toast]);

  const handleGoogleError = useCallback((err: Error) => {
    toast({
      title: "No se pudo iniciar sesión con Google",
      description: err.message || "Revisa la configuración de Google.",
      variant: "destructive",
    });
    setIsLoading(false);
  }, [toast]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* ── Panel izquierdo: imagen de fondo de la usuaria + pitch de marca ── */}
      <div className="relative lg:w-1/2 min-h-[360px] lg:min-h-screen overflow-hidden flex items-center">
        <img src={tripHeaderImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
        {/* Oscurecido carbón + glow azul central para legibilidad (estilo app) */}
        <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/85 to-background/70" />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(65% 55% at 28% 22%, rgba(63,140,255,0.20), transparent 62%)" }}
        />

        <div className="relative z-10 w-full max-w-xl mx-auto px-8 lg:px-14 py-14">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] text-foreground">
            {t("auth.heroTitle")}
          </h1>

          <ul className="mt-8 space-y-3">
            {[t("auth.heroBullet1"), t("auth.heroBullet2"), t("auth.heroBullet3")].map((bullet) => (
              <li key={bullet} className="flex items-center gap-3 text-muted-foreground">
                <Check className="w-4 h-4 text-primary shrink-0" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          {/* Tarjeta mockup del informe (mismo lenguaje visual que el PDF) */}
          <div className="mt-10 max-w-xs rounded-2xl bg-white text-black p-4 shadow-2xl">
            <p className="text-sm font-bold">{t("auth.heroCardTitle")}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t("auth.heroCardMeta")}</p>
            <div className="mt-3 rounded-xl bg-[#101114] text-white flex items-center justify-between px-4 py-3">
              <span className="text-[10px] font-semibold tracking-wide text-gray-400">{t("auth.heroCardTotalLabel")}</span>
              <span className="text-lg font-bold tabular-nums">1.284,50 €</span>
            </div>
          </div>

          <p className="mt-10 text-xs text-muted-foreground">{t("auth.heroFooter")}</p>
        </div>
      </div>

      {/* ── Panel derecho: formulario ── */}
      <div className="lg:w-1/2 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight text-foreground text-center">
            {isLogin ? t("auth.welcomeBackTitle") : t("auth.createAccountTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground text-center">
            {isLogin ? t("auth.welcomeBackSubtitle") : t("auth.createAccountSubtitle")}
          </p>

          {showVerifyEmailNotice && (
            <Alert className="mt-6 bg-secondary/20 border-border/60">
              <AlertTitle>{t("auth.verifyEmailTitle")}</AlertTitle>
              <AlertDescription>{t("auth.verifyEmailBody")}</AlertDescription>
            </Alert>
          )}

          <GoogleSignInButton
            disabled={isLoading}
            isSignUp={!isLogin}
            onCredential={handleGoogle}
            onError={handleGoogleError}
          />

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-background text-muted-foreground">{t("auth.orWithEmail")}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">{t("auth.fullName")}</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Max Mustermann"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.password")}</Label>
                {isLogin && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={handleForgotPassword}
                    disabled={isLoading}
                  >
                    {t("auth.forgotPassword")}
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  title={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span className="sr-only">{showPassword ? t("auth.hidePassword") : t("auth.showPassword")}</span>
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-11" variant="add" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                isLogin ? t("auth.login") : t("auth.createAccount")
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isLogin ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
            <button
              type="button"
              className="text-primary font-semibold hover:underline"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? t("auth.startFree") : t("auth.login")}
            </button>
          </p>

          <p className="text-center text-xs text-muted-foreground mt-8">
            {t("auth.byContinuing")}{" "}
            <Link to="/legal/terms" className="text-primary hover:underline">
              {t("auth.terms")}
            </Link>{" "}
            {t("auth.and")}{" "}
            <Link to="/legal/privacy" className="text-primary hover:underline">
              {t("auth.privacy")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
