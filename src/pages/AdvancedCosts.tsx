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
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

  const distanceFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
      }),
    [locale],
  );

  const compactCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [locale],
  );

  const parseTripDate = (value: string): Date | null => {
    if (!value) return null;
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(value);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      return new Date(year, month - 1, day);
    }
    const dt = new Date(value);
    return Number.isFinite(dt.getTime()) ? dt : null;
  };

  const periodTrips = useMemo(() => {
    const now = new Date();
    const start = new Date(now);

    if (periodFilter === "1m") start.setMonth(start.getMonth() - 1);
    else if (periodFilter === "3m") start.setMonth(start.getMonth() - 3);
    else if (periodFilter === "6m") start.setMonth(start.getMonth() - 6);
    else if (periodFilter === "1y") start.setFullYear(start.getFullYear() - 1);
    else start.setMonth(start.getMonth() - 3);

    return trips.filter((trip) => {
      const dt = parseTripDate(trip.date);
      return dt ? dt >= start && dt <= now : false;
    });
  }, [periodFilter, trips]);

  // Calculate real costs from trips and invoices
  const summaryData = useMemo(() => {
    const totalDistance = periodTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const totalTrips = periodTrips.length;
    
    // Sum all invoice amounts (converting to EUR if needed)
    const totalInvoiced = periodTrips.reduce((sum, t) => {
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
  }, [periodTrips]);

  const costBreakdown = useMemo(
    () => {
      const total = Number(summaryData.estimatedCost) || 0;
      const fuel = total * 0.6;
      const maintenance = total * 0.25;
      const other = total * 0.15;
      const avgPerTrip = summaryData.totalTrips > 0 ? total / summaryData.totalTrips : 0;

      const pct = (value: number) => {
        if (total <= 0) return 0;
        const p = (value / total) * 100;
        if (!Number.isFinite(p)) return 0;
        return Math.max(0, Math.min(100, p));
      };

      return [
        { label: t("advancedCosts.breakdownFuelEnergy"), value: fuel, color: "bg-info", percent: pct(fuel) },
        { label: t("advancedCosts.breakdownMaintenance"), value: maintenance, color: "bg-info", percent: pct(maintenance) },
        { label: t("advancedCosts.breakdownOther"), value: other, color: "bg-info", percent: pct(other) },
        {
          label: t("advancedCosts.breakdownAvgPerTrip"),
          value: avgPerTrip,
          color: "bg-success",
          percent: total > 0 && avgPerTrip > 0 ? 100 : 0,
        },
      ];
    },
    [summaryData.estimatedCost, summaryData.totalTrips, t],
  );

  const costAssumptions = useMemo(() => ({
    fuelPerKm: summaryData.costPerKm * 0.6,
    maintenanceTotal: summaryData.estimatedCost * 0.25,
    otherTotal: summaryData.estimatedCost * 0.15,
  }), [summaryData]);

  const projectCosts = useMemo(() => projects.map(p => {
    const projectTrips = periodTrips.filter(t => t.projectId === p.id);
    const distance = projectTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
    const invoiced = projectTrips.reduce((sum, t) => {
      if (!t.invoiceAmount) return sum;
      const amount = t.invoiceAmount;
      if (t.invoiceCurrency === 'USD') return sum + (amount * 0.92);
      if (t.invoiceCurrency === 'GBP') return sum + (amount * 1.17);
      return sum + amount;
    }, 0);
    
    return {
      projectId: p.id,
      project: p.name,
      distance,
      trips: projectTrips.length,
      total: invoiced,
      perKm: distance > 0 ? invoiced / distance : 0,
    };
  }), [periodTrips, projects]);

  const visibleProjectCosts = useMemo(() => {
    if (projectFilter === "all") return projectCosts;
    return projectCosts.filter((p) => p.projectId === projectFilter);
  }, [projectCosts, projectFilter]);

  const monthlyCosts = useMemo(() => {
    const byMonth = new Map<string, { distance: number; trips: number; invoiced: number }>();
    
    periodTrips.forEach(t => {
      const date = parseTripDate(t.date);
      if (!date) return;
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
        const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthName = monthDate.toLocaleDateString(locale, { month: "long", year: "numeric" });
        const monthShort = monthDate.toLocaleDateString(locale, { month: "short", year: "numeric" });
        
        return {
          monthKey,
          month: monthName,
          monthShort,
          distance: data.distance,
          trips: data.trips,
          fuel: data.invoiced * 0.6,
          maintenance: data.invoiced * 0.25,
          other: data.invoiced * 0.15,
          total: data.invoiced,
          perKm: data.distance > 0 ? data.invoiced / data.distance : 0,
        };
      });
	  }, [locale, periodTrips]);

  const monthlyChartData = useMemo(() => [...monthlyCosts].slice().reverse(), [monthlyCosts]);

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
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{distanceFormatter.format(summaryData.totalDistance)} km</p>
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
		                {/* Chart */}
		                <div className="h-64">
                      {visibleProjectCosts.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                          {t("advancedCosts.chartNoData")}
                        </div>
                      ) : visibleProjectCosts.every((p) => (Number(p.total) || 0) <= 0) ? (
                        <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground text-center px-6 gap-2">
                          <div>{t("advancedCosts.chartNoCostsTitle")}</div>
                          <div className="text-xs">{t("advancedCosts.chartNoCostsBody")}</div>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={visibleProjectCosts} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                              dataKey="project"
                              stroke="hsl(var(--muted-foreground))"
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                              interval={0}
                              tick={{ fill: "hsl(var(--muted-foreground))" }}
                              tickFormatter={(v: string) => (String(v).length > 12 ? `${String(v).slice(0, 12)}…` : v)}
                            />
                            <YAxis
                              stroke="hsl(var(--muted-foreground))"
                              fontSize={11}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v: number) => compactCurrencyFormatter.format(Number(v) || 0)}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                                padding: "8px 12px",
                                color: "hsl(var(--foreground))",
                              }}
                              labelStyle={{ color: "hsl(var(--foreground))" }}
                              formatter={(value: number, name: string, props: any) => {
                                const p = props?.payload as any;
                                const total = currencyFormatter.format(Number(p?.total) || 0);
                                const perKm = currencyFormatter.format(Number(p?.perKm) || 0);
                                const distance = `${distanceFormatter.format(Number(p?.distance) || 0)} km`;
                                return [`${total} (${perKm}/km, ${distance})`, t("advancedCosts.chartSeriesTotal")];
                              }}
                              cursor={{ fill: "hsl(var(--secondary) / 0.4)" }}
                            />
                            <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="hsl(210, 100%, 50%)" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
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
	                      {visibleProjectCosts.map((item, index) => (
	                        <tr key={index} className="border-b border-border/50">
	                          <td className="py-3 px-3 font-medium">{item.project}</td>
                          <td className="py-3 px-3 text-right text-muted-foreground">
                            {distanceFormatter.format(item.distance)} km
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
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold">{distanceFormatter.format(summaryData.totalDistance)} km</p>
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

              {/* Monthly Chart */}
              <div className="glass-card p-4 sm:p-6 animate-fade-in animation-delay-250">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="font-semibold">{t("advancedCosts.monthlyChartTitle")}</h3>
                </div>
                <div className="h-[260px] w-full">
                  {monthlyCosts.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      {t("advancedCosts.chartNoData")}
                    </div>
                  ) : monthlyCosts.every((m) => (Number(m.total) || 0) <= 0) ? (
                    <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground text-center px-4">
                      <div>{t("advancedCosts.chartNoCostsTitle")}</div>
                      <div className="text-xs">{t("advancedCosts.chartNoCostsBody")}</div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="monthShort"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                          tick={{ fill: "hsl(var(--muted-foreground))" }}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => compactCurrencyFormatter.format(Number(v) || 0)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            color: "hsl(var(--foreground))",
                          }}
                          labelStyle={{ color: "hsl(var(--foreground))" }}
                          labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.month ?? _label}
                          formatter={(value: number, name: string, props: any) => {
                            const p = props?.payload as any;
                            const total = currencyFormatter.format(Number(p?.total) || 0);
                            const perKm = currencyFormatter.format(Number(p?.perKm) || 0);
                            const distance = `${distanceFormatter.format(Number(p?.distance) || 0)} km`;
                            return [
                              `${currencyFormatter.format(Number(value) || 0)} (${t("advancedCosts.chartSeriesTotal")}: ${total}, ${t("advancedCosts.statAvgCostPerKm")}: ${perKm}, ${t("advancedCosts.statTotalDistance")}: ${distance})`,
                              name,
                            ];
                          }}
                          cursor={{ fill: "hsl(var(--secondary) / 0.4)" }}
                        />
                        <Legend
                          wrapperStyle={{ color: "hsl(var(--muted-foreground))", fontSize: "12px" }}
                          formatter={(value: any) => <span className="text-muted-foreground">{value}</span>}
                        />
                        <Bar
                          dataKey="fuel"
                          stackId="a"
                          name={t("advancedCosts.breakdownFuelEnergy")}
                          fill="hsl(210, 100%, 50%)"
                        />
                        <Bar
                          dataKey="maintenance"
                          stackId="a"
                          name={t("advancedCosts.breakdownMaintenance")}
                          fill="hsl(270, 100%, 60%)"
                        />
                        <Bar dataKey="other" stackId="a" name={t("advancedCosts.breakdownOther")} fill="hsl(150, 70%, 45%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
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
                    {monthlyCosts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 px-3 text-center text-sm text-muted-foreground">
                          {t("advancedCosts.chartNoData")}
                        </td>
                      </tr>
                    ) : (
                      monthlyCosts.map((item, index) => (
                        <tr key={item.monthKey ?? index} className="border-b border-border/50">
                          <td className="py-4 px-3 font-medium whitespace-nowrap">{item.month}</td>
                          <td className="py-4 px-3 text-right text-muted-foreground whitespace-nowrap">
                            {distanceFormatter.format(item.distance)} km
                          </td>
                          <td className="py-4 px-3 text-right text-muted-foreground">{item.trips}</td>
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
                      ))
                    )}
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
