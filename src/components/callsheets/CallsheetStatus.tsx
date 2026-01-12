import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, CheckCircle, AlertCircle, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CallsheetStatusProps {
  jobId: string;
}

export function CallsheetStatus({ jobId }: CallsheetStatusProps) {
  const [status, setStatus] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;

        // 1. Fetch Job
                const { data: jobData, error: jobError } = await supabase
          .from("callsheet_jobs")
          .select("*")
          .eq("id", jobId)
                    .maybeSingle();

                if (jobError) throw jobError;
                if (!jobData) return;
        setStatus(jobData);

        // 2. Fetch Results & Locations if done/review
        if (jobData.status === "done" || jobData.status === "needs_review") {
             const { data: resData } = await supabase
                .from("callsheet_results")
                .select("*")
                .eq("job_id", jobId)
                .single();
             setResults(resData);

             const { data: locData } = await supabase
                .from("callsheet_locations")
                .select("*")
                .eq("job_id", jobId);
             setLocations(locData || []);

             setLoading(false);
             clearInterval(interval);
        } else if (jobData.status === "failed") {
            setLoading(false);
            clearInterval(interval);
        }

      } catch (err: any) {
        setError(err.message);
        setLoading(false);
        clearInterval(interval);
      }
    };

    const interval = setInterval(fetchStatus, 3000); // Poll every 3s
    void fetchStatus();

    return () => clearInterval(interval);
  }, [jobId]);

  if (loading && !status) return <div className="p-4"><Loader2 className="animate-spin" /> Cargando estado...</div>;
  if (error) return <div className="text-foreground p-4">Error: {error}</div>;

    const isProcessing = status?.status === "created" || status?.status === "queued" || status?.status === "processing";

    return (
        <div className="space-y-4 p-4">
                {isProcessing && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Procesando…</span>
                    </div>
                )}

        {status?.status === 'done' && results && (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Resultados de Extracción</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p className="text-sm font-muted-foreground">Proyecto</p>
                            <p className="font-medium">{results.project_value || "-"}</p>
                        </div>
                        <div>
                            <p className="text-sm font-muted-foreground">Fecha</p>
                            <p className="font-medium">{results.date_value || "-"}</p>
                        </div>
                        <div>
                            <p className="text-sm font-muted-foreground">Productora</p>
                            <p className="font-medium">{results.producer_value || "-"}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )}

        {locations.length > 0 && (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Locaciones ({locations.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-3">
                        {locations.map((loc: any) => (
                            <li key={loc.id} className="border-b last:border-0 pb-2">
                                <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                                    <div>
                                        <p className="font-medium">{loc.formatted_address || loc.address_raw}</p>
                                        <p className="text-xs text-muted-foreground">Source: {loc.label_source}</p>
                                        {loc.geocode_quality && <Badge variant="outline" className="text-xs">{loc.geocode_quality}</Badge>}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        )}
    </div>
  );
}
