import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Filter, Upload, Calendar, MoreVertical, Pencil, Trash2, Map as MapIcon, CalendarPlus, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AddTripModal } from "@/components/trips/AddTripModal";
import { BulkUploadModal } from "@/components/trips/BulkUploadModal";
import { TripDetailModal } from "@/components/trips/TripDetailModal";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { Project, useProjects } from "@/contexts/ProjectsContext";
import { Trip, useTrips } from "@/contexts/TripsContext";
import { parseLocaleNumber, roundTo } from "@/lib/number";
import { Badge } from "@/components/ui/badge";
import { computeTripWarnings } from "@/lib/trip-warnings";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/contexts/AuthContext";
import { calculateTripEmissions } from "@/lib/emissions";
import { supabase } from "@/lib/supabaseClient";

// CO2 is calculated from user profile vehicle settings when saving a trip.
const mockTripsData: Trip[] = [{
  id: "1",
  date: "2024-01-15",
  route: ["Berlin HQ", "Leipzig", "München Studio"],
  project: "Film Production XY",
  purpose: "Location scouting",
  passengers: 2,
  distance: 584,
  co2: 0,
}, {
  id: "2",
  date: "2024-01-14",
  route: ["München Studio", "Nürnberg", "Frankfurt", "Köln Location"],
  project: "Film Production XY",
  purpose: "Equipment transport",
  passengers: 0,
  distance: 575,
  co2: 0,
}, {
  id: "3",
  date: "2024-01-13",
  route: ["Home Office", "Berlin HQ"],
  project: "Internal",
  purpose: "Office meeting",
  passengers: 0,
  distance: 45,
  co2: 0,
}, {
  id: "4",
  date: "2024-01-12",
  route: ["Berlin HQ", "Hannover", "Hamburg Meeting"],
  project: "Client ABC",
  purpose: "Client presentation",
  passengers: 1,
  warnings: ["Unusual distance"],
  distance: 289,
  co2: 0,
}, {
  id: "5",
  date: "2024-01-11",
  route: ["Hamburg Meeting", "Berlin HQ"],
  project: "Client ABC",
  purpose: "Return trip",
  passengers: 0,
  distance: 289,
  co2: 0,
}];
export default function Trips() {
  const { profile } = useUserProfile();
  const { t, tf, locale } = useI18n();
  const { getAccessToken } = useAuth();

  const emissionsInput = useMemo(() => {
    return {
      fuelType: profile.fuelType,
      fuelLPer100Km: parseLocaleNumber(profile.fuelLPer100Km),
      evKwhPer100Km: parseLocaleNumber(profile.evKwhPer100Km),
      gridKgCo2PerKwh: parseLocaleNumber(profile.gridKgCo2PerKwh),
    };
  }, [profile.evKwhPer100Km, profile.fuelLPer100Km, profile.fuelType, profile.gridKgCo2PerKwh]);

  const calculateCO2 = (distance: number) => calculateTripEmissions({ distanceKm: distance, ...emissionsInput }).co2Kg;

  const TRIPS_FILTERS_KEY = "filters:trips:v1";
  const loadTripsFilters = () => {
    try {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(TRIPS_FILTERS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const selectedProject = typeof parsed.selectedProject === "string" ? parsed.selectedProject : null;
      const selectedYear = typeof parsed.selectedYear === "string" ? parsed.selectedYear : null;
      return { selectedProject, selectedYear };
    } catch {
      return null;
    }
  };

  const [selectedProject, setSelectedProject] = useState(() => loadTripsFilters()?.selectedProject ?? "all");
  const [selectedYear, setSelectedYear] = useState(
    () => loadTripsFilters()?.selectedYear ?? new Date().getFullYear().toString()
  );
  // ... imports
  const { trips, addTrip, updateTrip, deleteTrip } = useTrips();
  // removed setProjects
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [tripToEdit, setTripToEdit] = useState<Trip | null>(null);
  const { toast } = useToast();
  const [invoiceResultsByJobId, setInvoiceResultsByJobId] = useState<Record<string, { total_amount?: any; currency?: any }>>(
    {},
  );
  const [invoiceJobsById, setInvoiceJobsById] = useState<Record<string, { status?: string; needs_review_reason?: string }>>(
    {},
  );

  useEffect(() => {
    if (!supabase) return;

    const jobIds = Array.from(
      new Set(
        (trips ?? [])
          .map((tr) => (typeof (tr as any).invoiceJobId === "string" ? (tr as any).invoiceJobId : ""))
          .filter(Boolean),
      ),
    );

    if (jobIds.length === 0) {
      setInvoiceResultsByJobId({});
      setInvoiceJobsById({});
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: jobRows, error: jobsError } = await supabase
        .from("invoice_jobs")
        .select("id, status, needs_review_reason")
        .in("id", jobIds);

      const { data, error } = await supabase
        .from("invoice_results")
        .select("job_id, total_amount, currency")
        .in("job_id", jobIds);

      if (cancelled) return;
      if (jobsError) {
        if (import.meta.env.DEV) console.warn("[Trips] Failed to fetch invoice_jobs:", jobsError);
      } else {
        const nextJobs: Record<string, { status?: string; needs_review_reason?: string }> = {};
        for (const row of jobRows ?? []) {
          const id = String((row as any).id ?? "");
          if (!id) continue;
          nextJobs[id] = { status: (row as any).status, needs_review_reason: (row as any).needs_review_reason };
        }
        setInvoiceJobsById(nextJobs);
      }

      if (error) {
        if (import.meta.env.DEV) console.warn("[Trips] Failed to fetch invoice_results:", error);
        return;
      }

      const next: Record<string, { total_amount?: any; currency?: any }> = {};
      for (const row of data ?? []) {
        const jobId = String((row as any).job_id ?? "");
        if (!jobId) continue;
        next[jobId] = { total_amount: (row as any).total_amount, currency: (row as any).currency };
      }
      setInvoiceResultsByJobId(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [trips]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TRIPS_FILTERS_KEY, JSON.stringify({ selectedProject, selectedYear }));
    } catch {
      // ignore
    }
  }, [selectedProject, selectedYear]);

  const openTripDetails = (trip: Trip) => {
    setSelectedTrip(trip);
    setDetailModalOpen(true);
  };
  const handleViewMap = (trip: Trip) => {
    openTripDetails(trip);
  };
  const handleEditTrip = (trip: Trip) => {
    setTripToEdit(trip);
    setEditModalOpen(true);
  };

  const handleDeleteTrip = async (trip: Trip) => {
    try {
      await deleteTrip(trip.id);

      setSelectedIds((prev) => {
        if (!prev.has(trip.id)) return prev;
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });

      if (selectedTrip?.id === trip.id) {
        setDetailModalOpen(false);
        setSelectedTrip(null);
      }

      toast({
        title: t("trips.toastTripsDeletedTitle"),
        description: tf("trips.toastTripsDeletedBody", { count: 1 }),
      });
    } catch {
      toast({
        title: t("trips.toastTripsDeletedTitle"),
        description: "No se pudo borrar el viaje.",
        variant: "destructive",
      });
    }
  };
  const handleAddToCalendar = (trip: Trip) => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return;

      const start = new Date(`${trip.date}T09:00:00`);
      const end = new Date(`${trip.date}T10:00:00`);
      const summary = `${trip.project} — ${trip.purpose || "Trip"}`;
      const location = trip.route[trip.route.length - 1] ?? "";
      const description = `${t("trips.route")}: ${trip.route.join(" -> ")}\n${t("trips.distance")}: ${trip.distance} km`;

      const response = await fetch("/api/google/calendar/create-event", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          description,
          location,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });
      const data: any = await response.json().catch(() => null);
      if (!response.ok) {
        toast({
          title: t("trips.toastAddedToCalendarTitle"),
          description: t("trips.calendarNotConnected"),
          variant: "destructive",
        });
        return;
      }

      toast({
        title: t("trips.toastAddedToCalendarTitle"),
        description: tf("trips.toastAddedToCalendarBody", {
          destination: location,
          date: new Date(trip.date).toLocaleDateString(locale),
        }),
      });

      if (data?.htmlLink) {
        window.open(data.htmlLink, "_blank", "noopener,noreferrer");
      }
    })();
  };

  const settingsRatePerKm = parseLocaleNumber(profile.ratePerKm) ?? 0;
  const settingsPassengerSurchargePerKm = parseLocaleNumber(profile.passengerSurcharge) ?? 0;
  const baseLocation = [profile.baseAddress, profile.city, profile.country].map((p) => p.trim()).filter(Boolean).join(", ");

  const getTripTime = (trip: Trip) => {
    const time = Date.parse(trip.date);
    return Number.isFinite(time) ? time : 0;
  };

  const getTripDestination = (trip: Trip | undefined) => {
    if (!trip) return baseLocation;
    return trip.route[trip.route.length - 1] || baseLocation;
  };

  const calculateTripReimbursement = (trip: Trip) => {
    const baseRate = trip.ratePerKmOverride ?? settingsRatePerKm;
    return roundTo(trip.distance * baseRate + trip.distance * trip.passengers * settingsPassengerSurchargePerKm, 2);
  };

  const formatInvoiceCountLabel = (count: number) => {
    const lang = String(locale || "").toLowerCase();
    if (lang.startsWith("de")) return count === 1 ? "1 Rechnung" : `${count} Rechnungen`;
    if (lang.startsWith("en")) return count === 1 ? "1 invoice" : `${count} invoices`;
    return count === 1 ? "1 factura" : `${count} facturas`;
  };

  const formatTripInvoiceCell = (trip: Trip) => {
    const docs = Array.isArray((trip as any).documents) ? ((trip as any).documents as any[]) : [];
    const invoiceDocCount = docs.filter((d) => d?.kind === "invoice" || typeof d?.invoiceJobId === "string").length;

    const amount = Number((trip as any).invoiceAmount);
    if (Number.isFinite(amount) && amount > 0) {
      const currency = String((trip as any).invoiceCurrency || "EUR").toUpperCase();
      return `${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    }

    const jobId = typeof (trip as any).invoiceJobId === "string" ? ((trip as any).invoiceJobId as string) : "";
    if (jobId) {
      const job = invoiceJobsById[jobId];
      const status = String(job?.status ?? "");
      const reason = String(job?.needs_review_reason ?? "");

      if (status === "out_of_quota") {
        return (
          <Badge
            variant="outline"
            className="border-violet-400/40 text-violet-200"
            title={reason || undefined}
          >
            {t("aiQuota.outOfQuotaBadge")}
          </Badge>
        );
      }

      if (status === "needs_review") {
        return (
          <Badge
            variant="outline"
            className="border-orange-500/40 text-orange-500"
            title={reason || undefined}
          >
            {t("tripDetail.invoiceNeedsReview")}
          </Badge>
        );
      }

      if (status === "failed") {
        return (
          <Badge variant="destructive" title={reason || undefined}>
            {t("tripDetail.invoiceFailed")}
          </Badge>
        );
      }

      const fromResults = invoiceResultsByJobId[jobId];
      const extracted = Number(fromResults?.total_amount);
      if (Number.isFinite(extracted) && extracted > 0) {
        const currency = String(fromResults?.currency || "EUR").toUpperCase();
        return `${extracted.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
      }
      return <Badge variant="secondary">{t("tripDetail.invoiceExtracting")}</Badge>;
    }

    if (invoiceDocCount > 0) {
      return <Badge variant="outline">{formatInvoiceCountLabel(invoiceDocCount)}</Badge>;
    }

    return trip.invoice || "-";
  };

  type SavedTrip = {
    id: string;
    date: string;
    route: string[];
    project: string;
    projectId?: string; // Added
    purpose: string;
    passengers: number;
    invoice?: string;
    distance: number;
    ratePerKmOverride?: number | null;
    specialOrigin?: "base" | "continue" | "return";
    documents?: Trip["documents"];
  };

  const handleSaveTrip = async (data: SavedTrip) => {
    const trimmedProject = data.project.trim();
    const trimmedInvoice = data.invoice?.trim() ? data.invoice.trim() : undefined;

    const nextTrip: Trip = {
      id: data.id,
      date: data.date,
      route: data.route,
      project: trimmedProject,
      projectId: data.projectId, // Propagate ID
      purpose: data.purpose,
      passengers: data.passengers,
      invoice: trimmedInvoice,
      distance: data.distance,
      co2: calculateCO2(data.distance),
      ratePerKmOverride: data.ratePerKmOverride ?? null,
      specialOrigin: data.specialOrigin ?? "base",
      documents: data.documents,
    };

    const exists = trips.some((t) => t.id === data.id);
    const ok = exists ? await updateTrip(data.id, nextTrip) : await addTrip(nextTrip);
    if (ok) {
      toast({
        title: exists ? t("trips.toastTripUpdatedTitle") : t("trips.toastTripCreatedTitle"),
        description: exists ? t("trips.toastTripUpdatedBody") : t("trips.toastTripCreatedBody"),
      });
    }
  };

  const tripsByDateDesc = [...trips].sort((a, b) => getTripTime(b) - getTripTime(a) || a.id.localeCompare(b.id));
  const addPreviousDestination = getTripDestination(tripsByDateDesc[0]);
  const editPreviousDestination = (() => {
    if (!tripToEdit) return addPreviousDestination;
    const index = tripsByDateDesc.findIndex((t) => t.id === tripToEdit.id);
    if (index < 0) return addPreviousDestination;
    return getTripDestination(tripsByDateDesc[index + 1]);
  })();
  const filteredTrips = trips.filter(trip => {
    const matchesProject = selectedProject === "all" || trip.project === selectedProject;
    const matchesYear = selectedYear === "all" || trip.date.startsWith(selectedYear);
    return matchesProject && matchesYear;
  });

  const tripWarnings = computeTripWarnings(trips);

  const visibleTrips = [...filteredTrips].sort((a, b) => {
    const diff = getTripTime(a) - getTripTime(b);
    if (diff !== 0) return dateSort === "asc" ? diff : -diff;
    return a.id.localeCompare(b.id);
  });
  const toggleSelectAll = () => {
    if (selectedIds.size === visibleTrips.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleTrips.map(t => t.id)));
    }
  };
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };
  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteTrip(id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;

    if (failed === 0) {
      toast({
        title: t("trips.toastTripsDeletedTitle"),
        description: tf("trips.toastTripsDeletedBody", { count: ids.length }),
      });
      setSelectedIds(new Set());
      return;
    }

    toast({
      title: t("trips.toastTripsDeletedTitle"),
      description: `Se borraron ${ok}/${ids.length}. ${failed} fallaron (no se borró todo lo asociado).`,
      variant: "destructive",
    });
  };
  const isAllSelected = visibleTrips.length > 0 && selectedIds.size === visibleTrips.length;
  const isSomeSelected = selectedIds.size > 0;
  return <MainLayout>
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            {t("trips.title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("trips.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSomeSelected && <Button variant="destructive" onClick={handleDeleteSelected}>
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">{t("trips.delete")} ({selectedIds.size})</span>
          </Button>}
          <BulkUploadModal 
            trigger={<Button variant="upload">
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">{t("trips.bulkUpload")}</span>
            </Button>} 
            onSave={handleSaveTrip}
          />
          <AddTripModal trigger={<Button>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t("trips.addTrip")}</span>
          </Button>} onSave={handleSaveTrip} previousDestination={addPreviousDestination} />
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 animate-fade-in animation-delay-100">
        <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-full sm:w-48 bg-secondary/50">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder={t("trips.project")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("trips.allProjects")}</SelectItem>
              <SelectItem value="Film Production XY">Film Production XY</SelectItem>
              <SelectItem value="Client ABC">Client ABC</SelectItem>
              <SelectItem value="Internal">Internal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-full sm:w-32 bg-secondary/50">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder={t("trips.year")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile & Tablet Cards View */}
      <div className="lg:hidden space-y-3 animate-fade-in animation-delay-200">
        {visibleTrips.map((trip, index) => <div key={trip.id} className={`glass-card p-3 sm:p-4 animate-slide-up ${selectedIds.has(trip.id) ? 'ring-2 ring-primary' : ''}`} style={{
          animationDelay: `${index * 50}ms`
        }}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
              <Checkbox
                checked={selectedIds.has(trip.id)}
                onCheckedChange={() => toggleSelect(trip.id)}
                aria-label={tf("trips.selectTrip", { id: trip.id })}
                className="mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0 overflow-hidden">
                {/* Date and Project */}
                <div className="flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-2 mb-2">
                  <span className="text-sm sm:text-base font-medium shrink-0">
                    {new Date(trip.date).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric"
                    })}
                  </span>
                  {(tripWarnings.byId[trip.id]?.length ?? 0) > 0 && (
                    <span title={(tripWarnings.byId[trip.id] ?? []).map((w) => w.title).join("\n")}>
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                    </span>
                  )}
                  {trip.specialOrigin === "continue" && (
                    <Badge variant="secondary" className="w-fit text-[10px] sm:text-xs">
                      Continuación
                    </Badge>
                  )}
                  {trip.specialOrigin === "return" && (
                    <Badge variant="secondary" className="w-fit text-[10px] sm:text-xs">
                      Fin continuación
                    </Badge>
                  )}
                  <span className="text-[10px] sm:text-xs text-primary truncate max-w-[150px] sm:max-w-none">
                    {trip.project}
                  </span>
                </div>

                {/* Route - Better tablet layout */}
                <div className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-medium text-foreground">{trip.route[0]}</span>
                    <span className="text-primary">→</span>
                    {trip.route.length > 2 && <span className="hidden md:inline text-muted-foreground">
                      {trip.route.slice(1, -1).join(" → ")} →
                    </span>}
                    <span className="font-medium text-foreground">{trip.route[trip.route.length - 1]}</span>
                    {trip.route.length > 2 && <span className="md:hidden text-[10px] sm:text-xs text-muted-foreground ml-1">(+{trip.route.length - 2})</span>}
                  </div>
                </div>

                {/* Stats Grid - Better responsive grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 sm:gap-2 text-xs sm:text-sm">
                  <div className="flex justify-between md:flex-col md:gap-0.5">
                    <span className="text-muted-foreground">Distancia:</span>
                    <span className="font-medium">{trip.distance} km</span>
                  </div>
                  <div className="flex justify-between md:flex-col md:gap-0.5">
                    <span className="text-muted-foreground text-center">CO₂:</span>
                    <span className="text-emerald-500 font-medium text-center">{trip.co2} kg</span>
                  </div>
                  <div className="flex justify-between md:flex-col md:gap-0.5">
                    <span className="text-muted-foreground text-center">Reembolso:</span>
                    <span className="text-primary font-medium text-center">{calculateTripReimbursement(trip).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between md:flex-col md:gap-0.5">
                    <span className="text-muted-foreground text-center">Pasajeros:</span>
                    <span className="font-medium text-center">{trip.passengers || "-"}</span>
                  </div>
                </div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0">
                  <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-popover"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onSelect={(e) => {
                    handleViewMap(trip);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapIcon className="w-4 h-4 mr-2" />
                  {t("trips.viewMap")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    handleAddToCalendar(trip);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  {t("trips.addToCalendar")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    handleEditTrip(trip);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {t("trips.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleDeleteTrip(trip);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t("trips.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>)}
      </div>

      {/* Desktop Table View - Only on large screens */}
      <div className="hidden lg:block glass-card overflow-hidden animate-fade-in animation-delay-200">
        <div className={visibleTrips.length > 8 ? "overflow-x-auto overflow-y-auto max-h-[32rem]" : "overflow-x-auto"}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="w-10">
                  <Checkbox checked={isAllSelected} onCheckedChange={toggleSelectAll} aria-label={t("projects.selectAll")} />
                </TableHead>
                <TableHead className="text-foreground font-semibold whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setDateSort((prev) => (prev === "asc" ? "desc" : "asc"))}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    aria-label={tf("trips.sortByDate", {
                      order: dateSort === "asc" ? t("trips.sortAsc") : t("trips.sortDesc"),
                    })}
                    title={t("trips.date")}
                  >
                    {t("trips.date")}
                    <span className="flex flex-col leading-none">
                      <ChevronUp className={`h-3 w-3 ${dateSort === "asc" ? "text-foreground" : "text-muted-foreground/50"}`} />
                      <ChevronDown className={`-mt-1 h-3 w-3 ${dateSort === "desc" ? "text-foreground" : "text-muted-foreground/50"}`} />
                    </span>
                  </button>
                </TableHead>
                <TableHead className="text-foreground font-semibold whitespace-nowrap">{t("trips.route")}</TableHead>
                <TableHead className="text-foreground font-semibold whitespace-nowrap">{t("trips.project")}</TableHead>
                <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">{t("trips.co2")}</TableHead>
                <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">Factura</TableHead>
                <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden lg:table-cell">{t("trips.passengers")}</TableHead>
                <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">{t("trips.reimbursement")}</TableHead>
                <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">{t("trips.distance")}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTrips.map((trip, index) => <TableRow
                key={trip.id}
                className={`hover:bg-secondary/30 border-border/30 animate-slide-up cursor-pointer ${selectedIds.has(trip.id) ? 'bg-primary/10' : ''}`}
                style={{
                  animationDelay: `${index * 50}ms`
                }}
                role="button"
                tabIndex={0}
                onClick={() => openTripDetails(trip)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openTripDetails(trip);
                  }
                }}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(trip.id)}
                    onCheckedChange={() => toggleSelect(trip.id)}
                    aria-label={tf("trips.selectTrip", { id: trip.id })}
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span>
                      {new Date(trip.date).toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                      })}
                    </span>
                    {(tripWarnings.byId[trip.id]?.length ?? 0) > 0 && (
                      <span title={(tripWarnings.byId[trip.id] ?? []).map((w) => w.title).join("\n")}>
                        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                      </span>
                    )}
                    {trip.specialOrigin === "continue" && <Badge variant="secondary">Continuación</Badge>}
                    {trip.specialOrigin === "return" && <Badge variant="secondary">Fin continuación</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 flex-wrap">
                    {trip.route.map((stop, i) => <span key={i} className="flex items-center">
                      <span className={i === 0 || i === trip.route.length - 1 ? "font-medium" : "text-muted-foreground"}>
                        {stop}
                      </span>
                      {i < trip.route.length - 1 && <span className="mx-1 text-primary">→</span>}
                    </span>)}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-primary whitespace-nowrap">
                    {trip.project}
                  </span>
                </TableCell>
                <TableCell className="text-right text-emerald-500 whitespace-nowrap">{trip.co2} kg</TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatTripInvoiceCell(trip)}</TableCell>
                <TableCell className="text-right text-muted-foreground hidden lg:table-cell">{trip.passengers || "-"}</TableCell>
                <TableCell className="text-right text-primary font-medium whitespace-nowrap">{calculateTripReimbursement(trip).toFixed(2)} €</TableCell>
                <TableCell className="text-right font-semibold whitespace-nowrap">{trip.distance} km</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-popover"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuItem
                        onSelect={(e) => {
                          handleViewMap(trip);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MapIcon className="w-4 h-4 mr-2" />
                        {t("trips.viewMap")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={(e) => {
                          handleAddToCalendar(trip);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CalendarPlus className="w-4 h-4 mr-2" />
                        {t("trips.addToCalendar")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={(e) => {
                          handleEditTrip(trip);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        {t("trips.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={(e) => {
                          e.preventDefault();
                          void handleDeleteTrip(trip);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t("trips.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Summary */}
      <div className="glass-card p-4 animate-fade-in">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {tf("trips.showing", { count: visibleTrips.length })}
          </span>
          <span className="font-medium">
            {tf("trips.total", { km: visibleTrips.reduce((acc, trip) => acc + trip.distance, 0).toLocaleString(locale) })}
          </span>
        </div>
      </div>

      {/* Trip Detail Modal */}
      <TripDetailModal trip={selectedTrip} open={detailModalOpen} onOpenChange={setDetailModalOpen} />

      {/* Edit Trip Modal */}
      <AddTripModal
        trip={tripToEdit}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSave={handleSaveTrip}
        previousDestination={editPreviousDestination}
      />
    </div>
  </MainLayout>;
}
