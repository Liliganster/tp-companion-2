import { useState, useEffect } from "react";
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

  const handleGoogle = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      toast({
        title: "No se pudo iniciar sesión con Google",
        description: err?.message ?? "Revisa la configuración del proveedor en Supabase/Google.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

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
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {isLogin ? t("auth.welcomeBackTitle") : t("auth.createAccountTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLogin ? t("auth.welcomeBackSubtitle") : t("auth.createAccountSubtitle")}
          </p>

          {showVerifyEmailNotice && (
            <Alert className="mt-6 bg-secondary/20 border-border/60">
              <AlertTitle>{t("auth.verifyEmailTitle")}</AlertTitle>
              <AlertDescription>{t("auth.verifyEmailBody")}</AlertDescription>
            </Alert>
          )}

          <Button variant="secondary" className="w-full mt-6 h-11" type="button" disabled={isLoading} onClick={handleGoogle}>
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {t("auth.continueWithGoogle")}
          </Button>

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
                placeholder="tu@correo.at"
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
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
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
