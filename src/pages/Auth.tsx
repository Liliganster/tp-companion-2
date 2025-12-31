import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, User, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import tripHeaderImage from "@/assets/trip-modal-header.jpg";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "react-router-dom";

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
      console.error("Password reset error:", err);
      toast({
        title: "No se pudo enviar",
        description: err?.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Top background image (NOT full-width; fades down) */}
      <div className="absolute inset-x-0 top-0 pointer-events-none">
        <div className="mx-auto w-full max-w-6xl px-6 pt-10">
          <div className="relative h-[320px] overflow-hidden rounded-2xl">
            <img
              src={tripHeaderImage}
              alt=""
              className="w-full h-full object-cover opacity-80 scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/20 to-background" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/50 via-background/0 to-background/50" />
          </div>
        </div>
      </div>

      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMjI4M2IiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

      <div className="relative mx-auto w-full max-w-6xl px-6 min-h-screen flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="glass-card p-8 animate-scale-in">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-semibold tracking-tight">Fahrtenbuch Pro</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("auth.tagline")}</p>
            </div>

            {showVerifyEmailNotice && (
              <Alert className="mb-6 bg-secondary/20 border-border/60">
                <AlertTitle>{t("auth.verifyEmailTitle")}</AlertTitle>
                <AlertDescription>{t("auth.verifyEmailBody")}</AlertDescription>
              </Alert>
            )}

            <div className="flex p-1 rounded-lg bg-secondary/50 mb-6">
              <button
                onClick={() => setIsLogin(true)}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
                  isLogin ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                type="button"
              >
                {t("auth.login")}
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
                  !isLogin ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                type="button"
              >
                {t("auth.signUp")}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2 animate-fade-in">
                  <Label htmlFor="name">{t("auth.fullName")}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Max Mustermann"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10 bg-secondary/50"
                      autoComplete="name"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="max@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-secondary/50"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder=""
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-secondary/50"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                  </button>
                </div>
              </div>

              {isLogin && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={handleForgotPassword}
                    disabled={isLoading}
                  >
                    {t("auth.forgotPassword")}
                  </button>
                </div>
              )}

              <Button type="submit" className="w-full" variant="add" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {isLogin ? t("auth.login") : t("auth.createAccount")}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-card text-muted-foreground">{t("auth.orContinueWith")}</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              type="button"
              disabled={isLoading}
              onClick={async () => {
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
              }}
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {t("auth.continueWithGoogle")}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
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
