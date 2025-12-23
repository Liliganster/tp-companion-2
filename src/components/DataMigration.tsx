import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { checkAndMigrateData } from "@/lib/migration";
import { Loader2 } from "lucide-react";

export function DataMigration() {
  const { user, loading: authLoading } = useAuth();
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;

    const runMigration = async () => {
        setMigrating(true);
        await checkAndMigrateData(user.id);
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
