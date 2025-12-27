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
import { useI18n } from "@/hooks/use-i18n";

export default function AdvancedCosts() {
  const navigate = useNavigate();
  const { t, tf, locale } = useI18n();
  const { projects } = useProjects();
  const { trips } = useTrips();
  const [activeTab, setActiveTab] = useState("resumen");
  const [periodFilter, setPeriodFilter] = useState("3m");
  const [projectFilter, setProjectFilter] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [chosenProjectId, setChosenProjectId] = useState("");
  const invoiceInputRef = useRef<HTMLInputElement>(null);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  );

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

  const costBreakdown = useMemo(
    () => [
      { label: t("advancedCosts.breakdownFuelEnergy"), value: summaryData.estimatedCost * 0.6, color: "bg-info", percent: 60 },
      { label: t("advancedCosts.breakdownMaintenance"), value: summaryData.estimatedCost * 0.25, color: "bg-info", percent: 25 },
      { label: t("advancedCosts.breakdownOther"), value: summaryData.estimatedCost * 0.15, color: "bg-info", percent: 15 },
      {
        label: t("advancedCosts.breakdownAvgPerTrip"),
        value: summaryData.totalTrips > 0 ? summaryData.estimatedCost / summaryData.totalTrips : 0,
        color: "bg-success",
        percent: 100,
      },
    ],
    [summaryData.estimatedCost, summaryData.totalTrips, t],
  );

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
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
        
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
  }, [locale, trips]);

  const uploadInvoicesForProject = async (files: FileList | null) => {
    const chosenProjectId = projectFilter;
    if (!files || files.length === 0) return;

    if (chosenProjectId === "all") {
      toast.error(t("advancedCosts.toastSelectProject"));
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      return;
    }

    if (!supabase) {
      toast.error(t("advancedCosts.toastSupabaseNotConfigured"));
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      return;
    }

    const list = Array.from(files);
    if (list.length > 20) {
      toast.error(t("advancedCosts.toastMaxDocuments"));
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      return;
    }

    for (const file of list) {
      if (!file.type.match(/pdf|image/)) {
        toast.error(t("advancedCosts.toastOnlyPdfOrImages"));
        if (invoiceInputRef.current) invoiceInputRef.current.value = "";
        return;
      }
    }

    setUploadingInvoice(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error(t("advancedCosts.toastNotAuthenticated"));

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

      if (successCount > 0) toast.success(tf("advancedCosts.toastUploadedInvoices", { count: successCount }));
      if (failCount > 0) toast.error(tf("advancedCosts.toastFailedDocuments", { count: failCount }));
    } catch (err: any) {
      console.error(err);
      toast.error(formatSupabaseError(err, t("advancedCosts.errorUploadInvoice")));
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
	              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{t("advancedCosts.pageTitle")}</h1>
	              <p className="text-muted-foreground mt-1 text-sm sm:text-base">
	                {t("advancedCosts.pageSubtitle")}
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
	              <span className="hidden sm:inline">{t("advancedCosts.uploadInvoice")}</span>
	              <span className="sm:hidden">{t("advancedCosts.uploadShort")}</span>
	            </Button>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
	              <SelectContent>
	                <SelectItem value="1m">{t("advancedCosts.periodLastMonth")}</SelectItem>
	                <SelectItem value="3m">{t("advancedCosts.periodLast3Months")}</SelectItem>
	                <SelectItem value="6m">{t("advancedCosts.periodLast6Months")}</SelectItem>
	                <SelectItem value="1y">{t("advancedCosts.periodLastYear")}</SelectItem>
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
	            {t("advancedCosts.tabSummary")}
	          </button>
	          <button
	            onClick={() => setActiveTab("mensuales")}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === "mensuales"
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
	          >
	            {t("advancedCosts.tabMonthly")}
	          </button>
	        </div>

        {activeTab === "resumen" && (
          <>
            {/* Stats Grid */}
	            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in animation-delay-200">
	              <div className="glass-card p-4 sm:p-5">
	                <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t("advancedCosts.statTotalDistance")}</p>
	                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.totalDistance} km</p>
	              </div>
	              <div className="glass-card p-4 sm:p-5">
	                <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t("advancedCosts.statTotalTrips")}</p>
	                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.totalTrips}</p>
	              </div>
	              <div className="glass-card p-4 sm:p-5">
	                <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t("advancedCosts.statEstimatedTotalCost")}</p>
	                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{currencyFormatter.format(summaryData.estimatedCost)}</p>
	              </div>
	              <div className="glass-card p-4 sm:p-5">
	                <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t("advancedCosts.statAvgCostPerKm")}</p>
	                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{currencyFormatter.format(summaryData.costPerKm)}</p>
	              </div>
	            </div>

            {/* Breakdown and Assumptions */}
	            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in animation-delay-300">
	              {/* Cost Breakdown */}
	              <div className="glass-card p-6">
	                <h3 className="font-semibold mb-4">{t("advancedCosts.breakdownTitle")}</h3>
	                <div className="space-y-4">
	                  {costBreakdown.map((item, index) => (
	                    <div key={index}>
	                      <div className="flex justify-between mb-1">
	                        <span className="text-sm">{item.label}</span>
	                        <span className="text-sm font-medium">{currencyFormatter.format(item.value)}</span>
	                      </div>
	                      <Progress value={item.percent} className="h-2" />
	                    </div>
	                  ))}
	                </div>
	              </div>

	              {/* Cost Assumptions */}
	              <div className="glass-card p-6">
	                <h3 className="font-semibold mb-4">{t("advancedCosts.assumptionsTitle")}</h3>
	                <ul className="space-y-3 text-sm text-muted-foreground">
	                  <li className="flex items-start gap-2">
	                    <span className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
	                    {tf("advancedCosts.assumptionFuelPerKm", { amount: currencyFormatter.format(costAssumptions.fuelPerKm) })}
	                  </li>
	                  <li className="flex items-start gap-2">
	                    <span className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
	                    {tf("advancedCosts.assumptionMaintenanceTotal", { amount: currencyFormatter.format(costAssumptions.maintenanceTotal) })}
	                  </li>
	                  <li className="flex items-start gap-2">
	                    <span className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
	                    {tf("advancedCosts.assumptionOtherTotal", { amount: currencyFormatter.format(costAssumptions.otherTotal) })}
	                  </li>
	                  <li className="flex items-start gap-2">
	                    <span className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
	                    {t("advancedCosts.assumptionsHint")}{" "}
	                    <button 
	                      onClick={() => setSettingsOpen(true)}
	                      className="text-primary hover:underline"
	                    >
	                      {t("advancedCosts.assumptionsEdit")}
	                    </button>
	                  </li>
	                </ul>
	              </div>
	            </div>

	            {/* Project Analysis */}
	            <div className="glass-card p-6 animate-fade-in animation-delay-400">
	              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
	                <h3 className="font-semibold">{t("advancedCosts.projectAnalysisTitle")}</h3>
	                <div className="flex items-center gap-2">
	                  <span className="text-sm text-muted-foreground">{t("advancedCosts.projectLabel")}</span>
	                  <Select value={projectFilter} onValueChange={setProjectFilter}>
	                    <SelectTrigger className="w-[180px] bg-secondary/50">
	                      <SelectValue />
	                    </SelectTrigger>
	                    <SelectContent>
	                      <SelectItem value="all">{t("advancedCosts.allProjects")}</SelectItem>
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
	                    <div className="text-xs text-muted-foreground mb-2">{currencyFormatter.format(4)}</div>
	                    <div className="w-full border-t border-dashed border-border" />
	                  </div>
	                </div>

                {/* Projects Table */}
                <div className="overflow-x-auto">
	                  <table className="w-full text-sm">
	                    <thead>
	                      <tr className="border-b border-border">
	                        <th className="text-left py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
	                          {t("advancedCosts.tableProject")}
	                        </th>
	                        <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
	                          {t("advancedCosts.tableDistanceAbbr")}
	                        </th>
	                        <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
	                          {t("advancedCosts.tableTrips")}
	                        </th>
	                        <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
	                          {t("advancedCosts.tableTotal")}
	                        </th>
	                        <th className="text-right py-2 px-3 font-semibold text-xs uppercase text-muted-foreground">
	                          {t("advancedCosts.tableEurPerKm")}
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
	                            {currencyFormatter.format(item.total)}
	                          </td>
	                          <td className="py-3 px-3 text-right text-muted-foreground">
	                            {currencyFormatter.format(item.perKm)}
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
	                <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t("advancedCosts.statTotalDistance")}</p>
	                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.totalDistance} km</p>
	              </div>
	              <div className="glass-card p-4 sm:p-5">
	                <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t("advancedCosts.statTotalTrips")}</p>
	                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{summaryData.totalTrips}</p>
	              </div>
	              <div className="glass-card p-4 sm:p-5">
	                <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t("advancedCosts.statEstimatedTotalCost")}</p>
	                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{currencyFormatter.format(summaryData.estimatedCost)}</p>
	              </div>
	              <div className="glass-card p-4 sm:p-5">
	                <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t("advancedCosts.statAvgCostPerKm")}</p>
	                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{currencyFormatter.format(summaryData.costPerKm)}</p>
	              </div>
	            </div>

	            {/* Monthly Summary Table */}
	            <div className="glass-card p-4 sm:p-6 animate-fade-in animation-delay-300">
	              <h3 className="font-semibold mb-4">{t("advancedCosts.monthlySummaryTitle")}</h3>
	              <div className="overflow-x-auto">
	                <table className="w-full text-sm min-w-[700px]">
	                  <thead>
	                    <tr className="border-b border-border">
	                      <th className="text-left py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
	                        {t("advancedCosts.tableMonth")}
	                      </th>
	                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
	                        {t("advancedCosts.tableDistance")}
	                      </th>
	                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
	                        {t("advancedCosts.tableTrips")}
	                      </th>
	                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
	                        {t("advancedCosts.tableFuelEnergy")}
	                      </th>
	                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
	                        {t("advancedCosts.tableMaintenance")}
	                      </th>
	                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
	                        {t("advancedCosts.tableOther")}
	                      </th>
	                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
	                        {t("advancedCosts.tableTotal")}
	                      </th>
	                      <th className="text-right py-3 px-3 font-semibold text-xs uppercase text-muted-foreground whitespace-nowrap">
	                        {t("advancedCosts.statAvgCostPerKm")}
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
	                          {currencyFormatter.format(item.fuel)}
	                        </td>
	                        <td className="py-4 px-3 text-right text-muted-foreground whitespace-nowrap">
	                          {currencyFormatter.format(item.maintenance)}
	                        </td>
	                        <td className="py-4 px-3 text-right text-muted-foreground whitespace-nowrap">
	                          {currencyFormatter.format(item.other)}
	                        </td>
	                        <td className="py-4 px-3 text-right font-semibold whitespace-nowrap">
	                          {currencyFormatter.format(item.total)}
	                        </td>
	                        <td className="py-4 px-3 text-right text-muted-foreground whitespace-nowrap">
	                          {currencyFormatter.format(item.perKm)}
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
