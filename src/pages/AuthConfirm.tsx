import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

export default function AuthConfirm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    const fail = () => {
      toast({
        title: "Enlace no válido",
        description: "Solicita un nuevo correo para restablecer tu contraseña.",
        variant: "destructive",
      });
      navigate("/auth", { replace: true });
    };

    if (!supabase || !tokenHash || type !== "recovery") {
      fail();
      return;
    }

    void supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: "recovery" })
      .then(({ error }) => {
        if (error) {
          fail();
          return;
        }
        navigate("/auth/reset?mode=recovery", { replace: true });
      })
      .catch(fail);
  }, [navigate, searchParams, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        <h1 className="text-lg font-semibold">Verificando enlace seguro</h1>
        <p className="text-sm text-muted-foreground">Fahrtenbuch Pro está comprobando tu solicitud.</p>
      </div>
    </div>
  );
}
