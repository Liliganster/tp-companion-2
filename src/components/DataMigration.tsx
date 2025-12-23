import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { checkAndMigrateData } from "@/lib/migration";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DataMigration() {
  const { user, loading: authLoading } = useAuth();
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;

    const runMigration = async () => {
        setMigrating(true);
        const result = await checkAndMigrateData(user.id);
        if (result && result.ok === false) {
          if (result.reason === "supabase-not-configured") {
            toast.error("Supabase no está configurado (faltan variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
          } else if (result.reason === "failed") {
            toast.error(`La migración a la nube falló: ${result.error ?? "error desconocido"}`);
          }
        }
        setMigrating(false);
    };

    runMigration();
  }, [user, authLoading]);

  if (migrating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Syncing your data to the cloud...</p>
        </div>
      </div>
    );
  }

  return null;
}
