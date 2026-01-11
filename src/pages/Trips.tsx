import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Filter, Upload, Calendar, MoreVertical, Pencil, Trash2, Map as MapIcon, CalendarPlus, ChevronUp, ChevronDown, AlertTriangle, Loader2, ChevronsDown } from "lucide-react";
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
import { useEmissionsInput } from "@/hooks/use-emissions-input";
import { Badge } from "@/components/ui/badge";
import { computeTripWarnings } from "@/lib/trip-warnings";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/contexts/AuthContext";
import { calculateTripEmissions } from "@/lib/emissions";
import { supabase } from "@/lib/supabaseClient";
import { useLocation, useNavigate } from "react-router-dom";
import { useElectricityMapsCarbonIntensity } from "@/hooks/use-electricity-maps";
import { useClimatiqFuelFactor } from "@/hooks/use-climatiq";
import { usePlanLimits } from "@/hooks/use-plan-limits";

export default function Trips() {
  const { profile } = useUserProfile();
  const { t, tf, locale } = useI18n();
  const { getAccessToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { canAddNonAITrip, checkStopsLimit, limits } = usePlanLimits();

  const { emissionsInput: localEmissionsInput, fuelFactorData: fuelFactor, gridData: atGrid, isLoading: isLoadingEmissionsData } = useEmissionsInput();
  
  // NOTE: TripsContext already provides calculated CO2 in `trips`.
  // The local calculation here is redundant but ensures we use the very latest hook data if it differs from context.
  // We alias it to `localEmissionsInput` to match the previous variable name if needed, or just `emissionsInput`.
  const emissionsInput = localEmissionsInput;

  const calculateCO2 = (distance: number, fuelLiters?: number | null, evKwhUsed?: number | null) =>
    calculateTripEmissions({ distanceKm: distance, fuelLiters, evKwhUsed, ...emissionsInput }).co2Kg;

  const TRIPS_FILTERS_KEY = "filters:trips:v1";
  const loadTripsFilters = () => {
    try {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(TRIPS_FILTERS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const selectedProjectRaw = typeof parsed.selectedProject === "string" ? parsed.selectedProject : null;
      const selectedYearRaw = typeof parsed.selectedYear === "string" ? parsed.selectedYear : null;
      const selectedProject = selectedProjectRaw && selectedProjectRaw.trim() ? selectedProjectRaw : null;
      const selectedYear = selectedYearRaw && selectedYearRaw.trim() ? selectedYearRaw : null;
      return { selectedProject, selectedYear };
    } catch {
      return null;
    }
  };

  const [selectedProject, setSelectedProject] = useState<string>(() => {
    const value = loadTripsFilters()?.selectedProject;
    if (!value || typeof value !== "string" || !value.trim()) return "all";
    return value;
  });
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    const value = loadTripsFilters()?.selectedYear;
    if (!value || typeof value !== "string" || !value.trim()) return "all";
    return value;
  });
  const [tripPrefill, setTripPrefill] = useState<{
    route?: string[];
    distance?: number;
    purpose?: string;
    project?: string;
  } | null>(null);
  const [prefillModalOpen, setPrefillModalOpen] = useState(false);
  // ... imports
  const { projects } = useProjects();
  const { trips, addTrip, updateTrip, deleteTrip } = useTrips();

  const uniqueProjects = useMemo(() => {
    const fromTrips = new Set(trips.map((t) => t.project).filter(Boolean));
    const fromProjects = new Set(projects.map((p) => p.name).filter(Boolean));
    // Combine both sources
    const all = new Set([...fromTrips, ...fromProjects]);
    return Array.from(all).filter((p) => p.trim() !== "").sort((a, b) => a.localeCompare(b));
  }, [trips, projects]);
  // removed setProjects
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [tripToEdit, setTripToEdit] = useState<Trip | null>(null);
  const { toast } = useToast();
  
  // Pagination state - show 5 trips initially
  const TRIPS_PER_PAGE = 5;
  const [visibleTripsCount, setVisibleTripsCount] = useState(TRIPS_PER_PAGE);


  useEffect(() => {
    const state = location.state as any;
    const next = state?.tripPrefill;
    if (!next || typeof next !== "object") return;

    setTripPrefill(next);
    setPrefillModalOpen(true);

    // Clear navigation state so it doesn't reopen on refresh/back.
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  // Validate filters
  useEffect(() => {
    // If selectedProject is not 'all' and not found in uniqueProjects, reset to 'all'
    if (selectedProject !== "all" && uniqueProjects.length > 0 && !uniqueProjects.includes(selectedProject)) {
      setSelectedProject("all");
    }
    
    // Validate year (simple check if it looks like a year, or reset if needed)
    // For now we assume typical years, but if the list of years was dynamic we'd check against that.
    // Here we just ensure it's not empty if not "all".
    if (!selectedYear) {
      setSelectedYear("all");
    }
  }, [selectedProject, uniqueProjects, selectedYear]);

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
    return roundTo(trip.distance * baseRate + trip.passengers * settingsPassengerSurchargePerKm, 2);
  };

  // Calculate trip expenses (toll + parking + other + fuel)
  const calculateTripExpenses = (trip: Trip) => {
    const toll = typeof trip.tollAmount === "number" ? trip.tollAmount : 0;
    const parking = typeof trip.parkingAmount === "number" ? trip.parkingAmount : 0;
    const other = typeof trip.otherExpenses === "number" ? trip.otherExpenses : 0;
    const fuel = typeof trip.fuelAmount === "number" ? trip.fuelAmount : 0;
    return roundTo(toll + parking + other + fuel, 2);
  };

  // Count total receipts/invoices for a trip
  const getTripReceiptCount = (trip: Trip) => {
    const docs = Array.isArray(trip.documents) ? trip.documents : [];
    // Count all receipt documents
    return docs.filter((d) => 
      d?.kind === "toll_receipt" || 
      d?.kind === "parking_receipt" || 
      d?.kind === "fuel_receipt" || 
      d?.kind === "other_receipt" ||
      d?.kind === "invoice"
    ).length;
  };

  // Calculate energy cost per km from profile
  const energyPerKm = useMemo(() => {
    if (profile.fuelType === "ev") {
      const kwhPer100 = parseLocaleNumber(profile.evKwhPer100Km) ?? 0;
      const pricePerKwh = parseLocaleNumber(profile.electricityPricePerKwh) ?? 0;
      if (kwhPer100 > 0 && pricePerKwh > 0) return (kwhPer100 / 100) * pricePerKwh;
    } else if (profile.fuelType === "gasoline" || profile.fuelType === "diesel") {
      const litersPer100 = parseLocaleNumber(profile.fuelLPer100Km) ?? 0;
      const pricePerLiter = parseLocaleNumber(profile.fuelPricePerLiter) ?? 0;
      if (litersPer100 > 0 && pricePerLiter > 0) return (litersPer100 / 100) * pricePerLiter;
    }
    return 0;
  }, [profile.fuelType, profile.evKwhPer100Km, profile.electricityPricePerKwh, profile.fuelLPer100Km, profile.fuelPricePerLiter]);

  // Calculate total trip cost (fuel + expenses)
  const calculateTripTotalCost = (trip: Trip) => {
    const fuelCost = trip.distance * energyPerKm;
    const expenses = calculateTripExpenses(trip);
    return roundTo(fuelCost + expenses, 2);
  };

  const formatReceiptCountLabel = (count: number) => {
    const lang = String(locale || "").toLowerCase();
    if (lang.startsWith("de")) return count === 1 ? "1 Beleg" : `${count} Belege`;
    if (lang.startsWith("en")) return count === 1 ? "1 receipt" : `${count} receipts`;
    return count === 1 ? "1 factura" : `${count} facturas`;
  };

  const formatTripReceiptCell = (trip: Trip) => {
    const count = getTripReceiptCount(trip);
    if (count > 0) {
      return <Badge variant="outline">{formatReceiptCountLabel(count)}</Badge>;
    }
    return "-";
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
    fuelLiters?: number | null;
    evKwhUsed?: number | null;
    ratePerKmOverride?: number | null;
    specialOrigin?: "base" | "continue" | "return";
    callsheet_job_id?: string;
    documents?: Trip["documents"];
    // Per-trip expenses
    tollAmount?: number | null;
    parkingAmount?: number | null;
    otherExpenses?: number | null;
    fuelAmount?: number | null;
  };

  const handleSaveTrip = async (data: SavedTrip) => {
    const trimmedProject = data.project.trim();
    const trimmedInvoice = data.invoice?.trim() ? data.invoice.trim() : undefined;

    const exists = trips.some((t) => t.id === data.id);

    // Check plan limits for new trips (not updates)
    if (!exists) {
      if (!canAddNonAITrip.allowed) {
        toast({
          title: t("limits.maxTripsReached"),
          description: canAddNonAITrip.message,
          variant: "destructive",
        });
        return false;
      }
    }

    // Check stops limit
    const stopsCheck = checkStopsLimit(data.route.length);
    if (!stopsCheck.allowed) {
      toast({
        title: t("limits.maxStopsReached"),
        description: tf("limits.maxStopsReached", { limit: limits.maxStopsPerTrip }),
        variant: "destructive",
      });
      return false;
    }

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
      fuelLiters: data.fuelLiters,
      evKwhUsed: data.evKwhUsed,
      co2: calculateCO2(data.distance, data.fuelLiters, data.evKwhUsed),
      ratePerKmOverride: data.ratePerKmOverride ?? null,
      specialOrigin: data.specialOrigin ?? "base",
      callsheet_job_id: data.callsheet_job_id,
      documents: data.documents,
      // Per-trip expenses
      tollAmount: data.tollAmount ?? null,
      parkingAmount: data.parkingAmount ?? null,
      otherExpenses: data.otherExpenses ?? null,
      fuelAmount: data.fuelAmount ?? null,
    };

    const ok = exists ? await updateTrip(data.id, nextTrip) : await addTrip(nextTrip);
    if (ok) {
      toast({
        title: exists ? t("trips.toastTripUpdatedTitle") : t("trips.toastTripCreatedTitle"),
        description: exists ? t("trips.toastTripUpdatedBody") : t("trips.toastTripCreatedBody"),
      });
    }
    return ok;
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

  const tripWarnings = computeTripWarnings(trips, t);

  // All sorted trips (for total counts)
  const allSortedTrips = useMemo(() => [...filteredTrips].sort((a, b) => {
    const diff = getTripTime(a) - getTripTime(b);
    if (diff !== 0) return dateSort === "asc" ? diff : -diff;
    return a.id.localeCompare(b.id);
  }), [filteredTrips, dateSort]);
  
  // Paginated trips - only show visibleTripsCount
  const visibleTrips = useMemo(() => 
    allSortedTrips.slice(0, visibleTripsCount), 
    [allSortedTrips, visibleTripsCount]
  );
  
  const hasMoreTrips = allSortedTrips.length > visibleTripsCount;
  const remainingTripsCount = allSortedTrips.length - visibleTripsCount;

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleTripsCount(TRIPS_PER_PAGE);
  }, [selectedProject, selectedYear, dateSort]);

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
    <div className="max-w-[1800px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">
              {t("trips.title")}
            </h1>
          </div>
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
              {uniqueProjects.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-full sm:w-32 bg-secondary/50">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder={t("trips.year")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("trips.all")}</SelectItem>
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
                      {t("trips.continuation")}
                    </Badge>
                  )}
                  {trip.specialOrigin === "return" && (
                    <Badge variant="secondary" className="w-fit text-[10px] sm:text-xs">
                      {t("trips.returnTrip")}
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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-1 sm:gap-2 text-xs sm:text-sm">
                  <div className="flex justify-between md:flex-col md:gap-0.5">
                    <span className="text-muted-foreground">Distancia:</span>
                    <span className="font-medium">{trip.distance} km</span>
                  </div>
                  <div className="flex justify-between md:flex-col md:gap-0.5">
                    <span className="text-muted-foreground text-center">CO₂:</span>
                    <span className="text-emerald-500 font-medium text-center">
                      {isLoadingEmissionsData ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `${calculateCO2(trip.distance, trip.fuelLiters, trip.evKwhUsed)} kg`}
                    </span>
                  </div>
                  <div className="flex justify-between md:flex-col md:gap-0.5">
                    <span className="text-muted-foreground text-center">{t("trips.expenses")}:</span>
                    <span className="text-orange-500 font-medium text-center">
                      {calculateTripExpenses(trip) > 0 ? `${calculateTripExpenses(trip).toFixed(2)} €` : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between md:flex-col md:gap-0.5">
                    <span className="text-muted-foreground text-center">{t("trips.reimbursement")}:</span>
                    <span className="text-primary font-medium text-center">{calculateTripReimbursement(trip).toFixed(2)} €</span>
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
        
        {/* Load More Button - Mobile */}
        {hasMoreTrips && (
          <button
            onClick={() => setVisibleTripsCount(prev => prev + TRIPS_PER_PAGE)}
            className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 font-medium py-3 rounded-md hover:bg-muted/50 transition-colors glass-card"
          >
            <ChevronsDown className="w-4 h-4" />
            {t("trips.loadMore")} ({remainingTripsCount} {t("advancedCosts.remaining")})
          </button>
        )}
      </div>

      {/* Desktop Table View - Only on large screens */}
      <div className="hidden lg:block glass-card overflow-hidden animate-fade-in animation-delay-200">
        <div className="overflow-x-auto">
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
                <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">{t("trips.receipts")}</TableHead>
                <TableHead className="text-foreground font-semibold text-right whitespace-nowrap hidden lg:table-cell">{t("trips.passengers")}</TableHead>
                <TableHead className="text-foreground font-semibold text-right whitespace-nowrap">{t("trips.expenses")}</TableHead>
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
                    {trip.specialOrigin === "continue" && <Badge variant="secondary">{t("trips.continuation")}</Badge>}
                    {trip.specialOrigin === "return" && <Badge variant="secondary">{t("trips.returnTrip")}</Badge>}
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
                <TableCell className="text-right text-emerald-500 whitespace-nowrap">
                  {isLoadingEmissionsData ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `${calculateCO2(trip.distance, trip.fuelLiters, trip.evKwhUsed)} kg`}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatTripReceiptCell(trip)}</TableCell>
                <TableCell className="text-right text-muted-foreground hidden lg:table-cell">{trip.passengers || "-"}</TableCell>
                <TableCell className="text-right text-orange-500 whitespace-nowrap">
                  {calculateTripExpenses(trip) > 0 ? `${calculateTripExpenses(trip).toFixed(2)} €` : "-"}
                </TableCell>
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
        
        {/* Load More Button */}
        {hasMoreTrips && (
          <div className="p-4 border-t border-border/50">
            <button
              onClick={() => setVisibleTripsCount(prev => prev + TRIPS_PER_PAGE)}
              className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 font-medium py-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ChevronsDown className="w-4 h-4" />
              {t("trips.loadMore")} ({remainingTripsCount} {t("advancedCosts.remaining")})
            </button>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="glass-card p-4 animate-fade-in">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {tf("trips.showing", { count: visibleTrips.length })} {t("trips.of")} {allSortedTrips.length}
          </span>
          <span className="font-medium">
            {tf("trips.total", { km: allSortedTrips.reduce((acc, trip) => acc + trip.distance, 0).toLocaleString(locale) })}
          </span>
        </div>
      </div>

      <AddTripModal
        open={prefillModalOpen}
        onOpenChange={(open) => {
          setPrefillModalOpen(open);
          if (!open) setTripPrefill(null);
        }}
        prefill={tripPrefill}
        onSave={handleSaveTrip}
        previousDestination={addPreviousDestination}
      />

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
