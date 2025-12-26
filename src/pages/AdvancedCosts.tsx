import { useRef, useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Upload, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { VehicleConfigModal } from "@/components/settings/VehicleConfigModal";
import { useProjects } from "@/contexts/ProjectsContext";
import { useTrips } from "@/contexts/TripsContext";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { toast } from "sonner";

export default function AdvancedCosts() {
  const navigate = useNavigate();
  const { projects } = useProjects();
  const { trips } = useTrips();
  const [activeTab, setActiveTab] = useState("resumen");
  const [periodFilter, setPeriodFilter] = useState("3m");
  const [projectFilter, setProjectFilter] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [chosenProjectId, setChosenProjectId] = useState("");
  const invoiceInputRef = useRef<HTMLInputElement>(null);

  // Calculate real costs from trips and invoices
  const summaryData = useMemo(() => {
    const totalDistance = trips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const totalTrips = trips.length;
    
    // Sum all invoice amounts (converting to EUR if needed)
    const totalInvoiced = trips.reduce((sum, t) => {
      if (!t.invoiceAmount) return sum;
      const amount = t.invoiceAmount;
      if (t.invoiceCurrency === 'USD') return sum + (amount * 0.92);
      if (t.invoiceCurrency === 'GBP') return sum + (amount * 1.17);
      return sum + amount;
    }, 0);

    const costPerKm = totalDistance > 0 ? totalInvoiced / totalDistance : 0;

    return {
      totalDistance,
      totalTrips,
      estimatedCost: totalInvoiced,
      costPerKm,
    };
  }, [trips]);

  const costBreakdown = useMemo(() => [
    { label: "Combustible / Energía", value: summaryData.estimatedCost * 0.6, color: "bg-info", percent: 60 },
    { label: "Mantenimiento", value: summaryData.estimatedCost * 0.25, color: "bg-info", percent: 25 },
    { label: "Otros", value: summaryData.estimatedCost * 0.15, color: "bg-info", percent: 15 },
    { label: "Costo Prom. / Viaje", value: summaryData.totalTrips > 0 ? summaryData.estimatedCost / summaryData.totalTrips : 0, color: "bg-success", percent: 100 },
  ], [summaryData]);

  const costAssumptions = useMemo(() => ({
    fuelPerKm: summaryData.costPerKm * 0.6,
    maintenanceTotal: summaryData.estimatedCost * 0.25,
    otherTotal: summaryData.estimatedCost * 0.15,
  }), [summaryData]);

  const projectCosts = useMemo(() => projects.map(p => {
    const projectTrips = trips.filter(t => t.projectId === p.id);
    const distance = projectTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const invoiced = projectTrips.reduce((sum, t) => {
      if (!t.invoiceAmount) return sum;
      const amount = t.invoiceAmount;
      if (t.invoiceCurrency === 'USD') return sum + (amount * 0.92);
      if (t.invoiceCurrency === 'GBP') return sum + (amount * 1.17);
      return sum + amount;
    }, 0);
    
    return {
      project: p.name,
      distance,
      trips: projectTrips.length,
      total: invoiced,
      perKm: distance > 0 ? invoiced / distance : 0,
    };
  }), [projects, trips]);

  const monthlyCosts = useMemo(() => {
    const byMonth = new Map<string, { distance: number; trips: number; invoiced: number }>();
    
    trips.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const existing = byMonth.get(monthKey) || { distance: 0, trips: 0, invoiced: 0 };
      
      const invoiced = t.invoiceAmount ? (
        t.invoiceCurrency === 'USD' ? t.invoiceAmount * 0.92 :
        t.invoiceCurrency === 'GBP' ? t.invoiceAmount * 1.17 :
        t.invoiceAmount
      ) : 0;
      
      byMonth.set(monthKey, {
        distance: existing.distance + (t.distance || 0),
        trips: existing.trips + 1,
        invoiced: existing.invoiced + invoiced,
      });
    });

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, data]) => {
        const [year, month] = monthKey.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        
        return {
          month: monthName,
          distance: data.distance,
          trips: data.trips,
          fuel: data.invoiced * 0.6,
          maintenance: data.invoiced * 0.25,
          other: data.invoiced * 0.15,
          total: data.invoiced,
        };
      });
  }, [trips]);

  const uploadInvoicesForProject = async (files: FileList | null) => {
    const chosenProjectId = projectFilter;
    if (!files || files.length === 0) return;

    if (chosenProjectId === "all") {
      toast.error("Selecciona un proyecto para adjuntar la factura");
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      return;
    }

    if (!supabase) {
      toast.error("Supabase no está configurado");
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      return;
    }

    const list = Array.from(files);
    if (list.length > 20) {
      toast.error("Máximo 20 documentos por vez");
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      return;
    }

    for (const file of list) {
      if (!file.type.match(/pdf|image/)) {
        toast.error("Solo se permiten archivos PDF o Imágenes");
        if (invoiceInputRef.current) invoiceInputRef.current.value = "";
        return;
      }
    }

    setUploadingInvoice(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No estás autenticado");

      let successCount = 0;
      let failCount = 0;

      for (const file of list) {
        try {
          const filePath = `${chosenProjectId}/${crypto.randomUUID()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("project_documents").upload(filePath, file);
          if (uploadError) throw uploadError;

          const { error: dbError } = await supabase.from("project_documents").insert({
            project_id: chosenProjectId,
            user_id: user.id,
            name: file.name,
            storage_path: filePath,
            type: "invoice",
          });

          if (dbError) {
            if (dbError.code === "23505") {
              console.warn(`Document ${filePath} already exists, skipping`);
              failCount += 1;
            } else {
              throw dbError;
            }
          } else {
            successCount += 1;
          }
        } catch (err) {
          console.error(err);
          failCount += 1;
        }
      }

      if (successCount > 0) toast.success(`Se subieron ${successCount} factura(s)/documento(s)`);
      if (failCount > 0) toast.error(`Fallaron ${failCount} documento(s)`);
    } catch (err: any) {
      console.error(err);
      toast.error(formatSupabaseError(err, "Error al subir factura"));
    } finally {
      setUploadingInvoice(false);
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
    }
  };

  return (
    <MainLayout>
      <VehicleConfigModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/advanced")} className="shrink-0 mt-1">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Análisis de costos</h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                Análisis de costos personal basado en la configuración de su vehículo.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={invoiceInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              multiple
              disabled={uploadingInvoice}
              onChange={(e) => void uploadInvoicesForProject(e.target.files)}
            />
            <Button
              className="flex-1 sm:flex-none"
              type="button"
              disabled={uploadingInvoice}
              onClick={() => invoiceInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Subir factura</span>
              <span className="sm:hidden">Subir</span>
            </Button>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">Último mes</SelectItem>
                <SelectItem value="3m">Últimos 3 meses</SelectItem>
                <SelectItem value="6m">Últimos 6 meses</SelectItem>
                <SelectItem value="1y">Último año</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-border animate-fade-in animation-delay-100">
          <button
            onClick={() => setActiveTab("resumen")}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === "resumen"
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Resumen
          </button>
          <button
            onClick={() => setActiveTab("mensuales")}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === "mensuales"
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Costos mensuales
          </button>
        </div>

        {activeTab === "resumen" && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in animation-delay-200">
              <div className="glass-card p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Distancia total</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.totalDistance} km</p>
              </div>
              <div className="glass-card p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Viajes totales</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.totalTrips}</p>
              </div>
              <div className="glass-card p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Costo total estimado</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.estimatedCost.toFixed(2)} €</p>
              </div>
              <div className="glass-card p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Costo Prom. / km</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.costPerKm.toFixed(2)} €</p>
              </div>
            </div>

            {/* Breakdown and Assumptions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in animation-delay-300">
              {/* Cost Breakdown */}
              <div className="glass-card p-6">
                <h3 className="font-semibold mb-4">Desglose de costos básico</h3>
                <div className="space-y-4">
                  {costBreakdown.map((item, index) => (
                    <div key={index}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">{item.label}</span>
                        <span className="text-sm font-medium">{item.value.toFixed(2)} €</span>
                      </div>
                      <Progress value={item.percent} className="h-2" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost Assumptions */}
              <div className="glass-card p-6">
                <h3 className="font-semibold mb-4">Supuestos de costos</h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    Combustible: €{costAssumptions.fuelPerKm.toFixed(2)}/km
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    Mantenimiento (total): €{costAssumptions.maintenanceTotal.toFixed(2)}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    Otros (total): €{costAssumptions.otherTotal.toFixed(2)}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    Estos costos se derivan de la configuración de su vehículo.{" "}
                    <button 
                      onClick={() => setSettingsOpen(true)}
                      className="text-primary hover:underline"
                    >
                      Haga clic aquí para editar.
                    </button>
                  </li>
                </ul>
              </div>
            </div>

            {/* Project Analysis */}
            <div className="glass-card p-6 animate-fade-in animation-delay-400">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h3 className="font-semibold">Análisis de costos por proyecto</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Proyecto:</span>
                  <Select value={projectFilter} onValueChange={setProjectFilter}>
                    <SelectTrigger className="w-[180px] bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los proyectos</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart Placeholder */}
                <div className="h-64 flex items-end gap-1 px-4">
                  <div className="flex flex-col items-center flex-1">
                    <div className="text-xs text-muted-foreground mb-2">4,00 €</div>
                    <div className="w-full border-t border-dashed border-border" />
                  </div>
                </div>

                {/* Projects Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
                          Proyecto
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
                          Dist.
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
                          Viajes
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
                          Total
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
                          €/km
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectCosts.map((item, index) => (
                        <tr key={index} className="border-b border-border/50">
                          <td className="py-3 px-3 font-medium">{item.project}</td>
                          <td className="py-3 px-3 text-right text-muted-foreground">
                            {item.distance} km
                          </td>
                          <td className="py-3 px-3 text-right text-muted-foreground">
                            {item.trips}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold">
                            {item.total.toFixed(2)} €
                          </td>
                          <td className="py-3 px-3 text-right text-muted-foreground">
                            {item.perKm.toFixed(2)} €
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "mensuales" && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in animation-delay-200">
              <div className="glass-card p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Distancia total</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.totalDistance} km</p>
              </div>
              <div className="glass-card p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Viajes totales</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.totalTrips}</p>
              </div>
              <div className="glass-card p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Costo total estimado</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.estimatedCost.toFixed(2)} €</p>
              </div>
              <div className="glass-card p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Costo Prom. / km</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.costPerKm.toFixed(2)} €</p>
              </div>
            </div>

            {/* Monthly Summary Table */}
            <div className="glass-card p-4 sm:p-6 animate-fade-in animation-delay-300">
              <h3 className="font-semibold mb-4">Resumen mensual</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
                        Mes
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
                        Distancia
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
                        Viajes
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
                        Combustible / Energía
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
                        Mantenimiento
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
                        Otros
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
                        Total
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
                        Costo Prom. / km
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyCosts.map((item, index) => (
                      <tr key={index} className="border-b border-border/50">
                        <td className="py-4 px-3 font-medium whitespace-nowrap">{item.month}</td>
                        <td className="py-4 px-3 text-right text-muted-foreground whitespace-nowrap">
                          {item.distance} km
                        </td>
                        <td className="py-4 px-3 text-right text-muted-foreground">
                          {item.trips}
                        </td>
                        <td className="py-4 px-3 text-right text-muted-foreground whitespace-nowrap">
                          {item.fuel.toFixed(2)} €
                        </td>
                        <td className="py-4 px-3 text-right text-muted-foreground whitespace-nowrap">
                          {item.maintenance.toFixed(2)} €
                        </td>
                        <td className="py-4 px-3 text-right text-muted-foreground whitespace-nowrap">
                          {item.other.toFixed(2)} €
                        </td>
                        <td className="py-4 px-3 text-right font-semibold whitespace-nowrap">
                          {item.total.toFixed(2)} €
                        </td>
                        <td className="py-4 px-3 text-right text-muted-foreground whitespace-nowrap">
                          {item.perKm.toFixed(2)} €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
