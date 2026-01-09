import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "@/contexts/ProjectsContext";
import { useTrips } from "@/contexts/TripsContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useI18n } from "@/hooks/use-i18n";
import { useCostAnalysis, type PeriodFilter } from "@/hooks/use-cost-analysis";
import { cn } from "@/lib/utils";

export default function AdvancedCosts() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const { projects } = useProjects();
  const { trips } = useTrips();
  const { profile } = useUserProfile();
  
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("this-year");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const {
    summary,
    projectCosts,
    availableYears,
    hasVehicleConfig,
  } = useCostAnalysis(trips, projects, profile, periodFilter);

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

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  // Period filter options
  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: "this-month", label: t("advancedCosts.periodThisMonth") },
    { value: "last-quarter", label: t("advancedCosts.periodLastQuarter") },
    { value: "this-year", label: t("advancedCosts.periodThisYear") },
    ...availableYears.map((year) => ({
      value: `year-${year}` as PeriodFilter,
      label: String(year),
    })),
    { value: "all", label: t("advancedCosts.periodAllTime") },
  ];

  const getBalanceIcon = (balance: number) => {
    if (balance > 0) return <TrendingUp className="w-5 h-5" />;
    if (balance < 0) return <TrendingDown className="w-5 h-5" />;
    return <Minus className="w-5 h-5" />;
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "text-green-600 dark:text-green-400";
    if (balance < 0) return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  const getBalanceBgColor = (balance: number) => {
    if (balance > 0) return "bg-green-500/10 border-green-500/30";
    if (balance < 0) return "bg-red-500/10 border-red-500/30";
    return "bg-muted/50 border-border";
  };

  return (
    <MainLayout>
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/advanced")} className="shrink-0 mt-1">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{t("advancedCosts.pageTitle")}</h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                {t("advancedCosts.pageSubtitleNew")}
              </p>
            </div>
          </div>

          {/* Warning if no vehicle configuration */}
          {!hasVehicleConfig && (
            <div 
              className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg p-4 cursor-pointer hover:bg-destructive/15 transition-colors"
              onClick={() => navigate("/settings")}
            >
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-destructive">
                  {t("advancedCosts.warningNoVehicleConfig")}
                </p>
                <p className="text-xs text-destructive/80 mt-1">
                  {t("advancedCosts.warningNoVehicleConfigDetails")}
                </p>
              </div>
              <Settings className="w-4 h-4 text-destructive flex-shrink-0" />
            </div>
          )}

          {/* Period filter buttons */}
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <Button
                key={option.value}
                variant={periodFilter === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriodFilter(option.value)}
                className="text-xs sm:text-sm"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Main Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in animation-delay-100">
          {/* Reimbursement Card */}
          <div className="glass-card p-5 border-l-4 border-l-blue-500">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">💰</span>
              <p className="text-sm text-muted-foreground font-medium">{t("advancedCosts.reimbursement")}</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
              {currencyFormatter.format(summary.reimbursement)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {distanceFormatter.format(summary.totalDistance)} km · {summary.totalTrips} {t("advancedCosts.tripsLabel")}
            </p>
          </div>

          {/* Real Cost Card */}
          <div className="glass-card p-5 border-l-4 border-l-orange-500">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">💸</span>
              <p className="text-sm text-muted-foreground font-medium">{t("advancedCosts.realCost")}</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">
              {currencyFormatter.format(summary.realCost)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {currencyFormatter.format(summary.costPerKm)}/km
            </p>
          </div>

          {/* Balance Card */}
          <div className={cn("glass-card p-5 border", getBalanceBgColor(summary.balance))}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📊</span>
              <p className="text-sm text-muted-foreground font-medium">{t("advancedCosts.balance")}</p>
            </div>
            <div className="flex items-center gap-2">
              <p className={cn("text-2xl sm:text-3xl font-bold", getBalanceColor(summary.balance))}>
                {summary.balance >= 0 ? "+" : ""}{currencyFormatter.format(summary.balance)}
              </p>
              <span className={getBalanceColor(summary.balance)}>
                {getBalanceIcon(summary.balance)}
              </span>
            </div>
            <p className={cn("text-xs mt-1 font-medium", getBalanceColor(summary.balance))}>
              {summary.isProfitable ? t("advancedCosts.profitable") : t("advancedCosts.notProfitable")}
            </p>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="glass-card p-5 animate-fade-in animation-delay-150">
          <h3 className="font-semibold mb-4">{t("advancedCosts.costBreakdown")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">⛽ {t("advancedCosts.breakdownFuelEnergy")}</p>
              <p className="text-lg font-semibold">{currencyFormatter.format(summary.fuelCost)}</p>
            </div>
            <div className="text-center p-3 bg-yellow-500/10 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">🛣️ {t("advancedCosts.breakdownTolls")}</p>
              <p className="text-lg font-semibold">{currencyFormatter.format(summary.tollsCost)}</p>
            </div>
            <div className="text-center p-3 bg-purple-500/10 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">🅿️ {t("advancedCosts.breakdownParking")}</p>
              <p className="text-lg font-semibold">{currencyFormatter.format(summary.parkingCost)}</p>
            </div>
            <div className="text-center p-3 bg-gray-500/10 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">📦 {t("advancedCosts.breakdownOther")}</p>
              <p className="text-lg font-semibold">{currencyFormatter.format(summary.otherCost)}</p>
            </div>
          </div>
        </div>

        {/* Project Breakdown Table */}
        <div className="glass-card p-5 animate-fade-in animation-delay-200">
          <h3 className="font-semibold mb-4">{t("advancedCosts.projectBreakdown")}</h3>
          
          {projectCosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t("advancedCosts.noProjectsInPeriod")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 font-semibold text-xs uppercase text-muted-foreground w-8"></th>
                    <th className="text-left py-3 px-2 font-semibold text-xs uppercase text-muted-foreground">
                      {t("advancedCosts.tableProject")}
                    </th>
                    <th className="text-right py-3 px-2 font-semibold text-xs uppercase text-muted-foreground">
                      km
                    </th>
                    <th className="text-right py-3 px-2 font-semibold text-xs uppercase text-muted-foreground">
                      {t("advancedCosts.tableCost")}
                    </th>
                    <th className="text-right py-3 px-2 font-semibold text-xs uppercase text-muted-foreground">
                      {t("advancedCosts.tableReimbursement")}
                    </th>
                    <th className="text-right py-3 px-2 font-semibold text-xs uppercase text-muted-foreground">
                      {t("advancedCosts.balance")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projectCosts.map((project) => {
                    const isExpanded = expandedProjects.has(project.projectId);
                    return (
                      <>
                        <tr
                          key={project.projectId}
                          className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => toggleProjectExpanded(project.projectId)}
                        >
                          <td className="py-3 px-2">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="py-3 px-2 font-medium">
                            <div className="flex items-center gap-2">
                              {project.projectName}
                              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {project.trips} {project.trips === 1 ? t("advancedCosts.trip") : t("advancedCosts.tripsLabel")}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right text-muted-foreground">
                            {distanceFormatter.format(project.distance)}
                          </td>
                          <td className="py-3 px-2 text-right text-orange-600 dark:text-orange-400">
                            {currencyFormatter.format(project.realCost)}
                          </td>
                          <td className="py-3 px-2 text-right text-blue-600 dark:text-blue-400">
                            {currencyFormatter.format(project.reimbursement)}
                          </td>
                          <td className={cn("py-3 px-2 text-right font-semibold", getBalanceColor(project.balance))}>
                            <div className="flex items-center justify-end gap-1">
                              {project.balance >= 0 ? "+" : ""}{currencyFormatter.format(project.balance)}
                              {project.isProfitable ? (
                                <span className="text-green-500">●</span>
                              ) : (
                                <span className="text-red-500">●</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Expanded trips */}
                        {isExpanded && project.tripsData.map((trip) => {
                          const tripDistance = typeof trip.distance === "number" ? trip.distance : 0;
                          const tripToll = typeof trip.tollAmount === "number" ? trip.tollAmount : 0;
                          const tripParking = typeof trip.parkingAmount === "number" ? trip.parkingAmount : 0;
                          const tripOther = typeof trip.otherExpenses === "number" ? trip.otherExpenses : 0;
                          const tripFuel = typeof trip.fuelAmount === "number" ? trip.fuelAmount : 0;
                          const tripCost = (tripFuel > 0 ? tripFuel : tripDistance * (summary.realCost / summary.totalDistance || 0)) + tripToll + tripParking + tripOther;
                          const tripReimb = tripDistance * (parseFloat(profile.ratePerKm?.replace(",", ".") || "0") || 0) + (trip.passengers || 0) * (parseFloat(profile.passengerSurcharge?.replace(",", ".") || "0") || 0);
                          const tripBalance = tripReimb - tripCost;
                          
                          return (
                            <tr key={trip.id} className="bg-muted/20 border-b border-border/30">
                              <td className="py-2 px-2"></td>
                              <td className="py-2 px-2 text-muted-foreground text-xs">
                                <span className="ml-4">
                                  {trip.date} · {trip.route?.join(" → ") || "-"}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-right text-muted-foreground text-xs">
                                {distanceFormatter.format(tripDistance)}
                              </td>
                              <td className="py-2 px-2 text-right text-orange-600/70 dark:text-orange-400/70 text-xs">
                                {currencyFormatter.format(tripCost)}
                              </td>
                              <td className="py-2 px-2 text-right text-blue-600/70 dark:text-blue-400/70 text-xs">
                                {currencyFormatter.format(tripReimb)}
                              </td>
                              <td className={cn("py-2 px-2 text-right text-xs", tripBalance >= 0 ? "text-green-600/70 dark:text-green-400/70" : "text-red-600/70 dark:text-red-400/70")}>
                                {tripBalance >= 0 ? "+" : ""}{currencyFormatter.format(tripBalance)}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
                {/* Totals row */}
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-3 px-2"></td>
                    <td className="py-3 px-2">{t("advancedCosts.total")}</td>
                    <td className="py-3 px-2 text-right">
                      {distanceFormatter.format(summary.totalDistance)} km
                    </td>
                    <td className="py-3 px-2 text-right text-orange-600 dark:text-orange-400">
                      {currencyFormatter.format(summary.realCost)}
                    </td>
                    <td className="py-3 px-2 text-right text-blue-600 dark:text-blue-400">
                      {currencyFormatter.format(summary.reimbursement)}
                    </td>
                    <td className={cn("py-3 px-2 text-right", getBalanceColor(summary.balance))}>
                      {summary.balance >= 0 ? "+" : ""}{currencyFormatter.format(summary.balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Info footer */}
        <div className="text-xs text-muted-foreground text-center py-4 animate-fade-in animation-delay-300">
          {t("advancedCosts.infoFooter")}
        </div>
      </div>
    </MainLayout>
  );
}
