import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Filter, Upload, Calendar, MoreVertical, Pencil, Trash2, Map, CalendarPlus, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
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
const calculateCO2 = (distance: number) => Math.round(distance * 0.12 * 10) / 10;
const mockTripsData: Trip[] = [{
  id: "1",
  date: "2024-01-15",
  route: ["Berlin HQ", "Leipzig", "München Studio"],
  project: "Film Production XY",
  purpose: "Location scouting",
  passengers: 2,
  distance: 584,
  co2: calculateCO2(584),
}, {
  id: "2",
  date: "2024-01-14",
  route: ["München Studio", "Nürnberg", "Frankfurt", "Köln Location"],
  project: "Film Production XY",
  purpose: "Equipment transport",
  passengers: 0,
  distance: 575,
  co2: calculateCO2(575),
}, {
  id: "3",
  date: "2024-01-13",
  route: ["Home Office", "Berlin HQ"],
  project: "Internal",
  purpose: "Office meeting",
  passengers: 0,
  distance: 45,
  co2: calculateCO2(45),
}, {
  id: "4",
  date: "2024-01-12",
  route: ["Berlin HQ", "Hannover", "Hamburg Meeting"],
  project: "Client ABC",
  purpose: "Client presentation",
  passengers: 1,
  warnings: ["Unusual distance"],
  distance: 289,
  co2: calculateCO2(289),
}, {
  id: "5",
  date: "2024-01-11",
  route: ["Hamburg Meeting", "Berlin HQ"],
  project: "Client ABC",
  purpose: "Return trip",
  passengers: 0,
  distance: 289,
  co2: calculateCO2(289),
}];
export default function Trips() {
  const { profile } = useUserProfile();
  const { t, tf, locale } = useI18n();
  const { getAccessToken } = useAuth();
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedYear, setSelectedYear] = useState("2024");
  const { trips, setTrips } = useTrips();
  const { setProjects } = useProjects();
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [tripToEdit, setTripToEdit] = useState<Trip | null>(null);
  const {
    toast
  } = useToast();
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

  type SavedTrip = {
    id: string;
    date: string;
    route: string[];
    project: string;
    purpose: string;
    passengers: number;
    invoice?: string;
    distance: number;
    ratePerKmOverride?: number | null;
    specialOrigin?: "base" | "continue" | "return";
    documents?: Trip["documents"];
  };

  type ProjectStatsDelta = {
    trips: number;
    totalKm: number;
    documents: number;
    invoices: number;
    estimatedCost: number;
    co2Emissions: number;
  };

  const getProjectKey = (name: string) => name.trim().toLowerCase();

  const getTripContribution = (trip: Pick<Trip, "distance" | "documents" | "invoice" | "ratePerKmOverride" | "co2">, projectRatePerKm: number): ProjectStatsDelta => {
    const distance = Number.isFinite(trip.distance) ? trip.distance : 0;
    const documents = trip.documents?.length ?? 0;
    const invoices = trip.invoice?.trim() ? 1 : 0;
    const rate = typeof trip.ratePerKmOverride === "number" ? trip.ratePerKmOverride : projectRatePerKm;
    const estimatedCost = distance * rate;
    const co2Emissions = Number.isFinite(trip.co2) ? trip.co2 : calculateCO2(distance);

    return { trips: 1, totalKm: distance, documents, invoices, estimatedCost, co2Emissions };
  };

  const negateDelta = (delta: ProjectStatsDelta): ProjectStatsDelta => ({
    trips: -delta.trips,
    totalKm: -delta.totalKm,
    documents: -delta.documents,
    invoices: -delta.invoices,
    estimatedCost: -delta.estimatedCost,
    co2Emissions: -delta.co2Emissions,
  });

  const diffDelta = (next: ProjectStatsDelta, prev: ProjectStatsDelta): ProjectStatsDelta => ({
    trips: next.trips - prev.trips,
    totalKm: next.totalKm - prev.totalKm,
    documents: next.documents - prev.documents,
    invoices: next.invoices - prev.invoices,
    estimatedCost: next.estimatedCost - prev.estimatedCost,
    co2Emissions: next.co2Emissions - prev.co2Emissions,
  });

  const applyDeltaToProject = (project: Project, delta: ProjectStatsDelta): Project => ({
    ...project,
    trips: Math.max(0, project.trips + delta.trips),
    totalKm: Math.max(0, project.totalKm + delta.totalKm),
    documents: Math.max(0, project.documents + delta.documents),
    invoices: Math.max(0, project.invoices + delta.invoices),
    estimatedCost: Math.max(0, project.estimatedCost + delta.estimatedCost),
    co2Emissions: Math.max(0, project.co2Emissions + delta.co2Emissions),
  });

  const handleSaveTrip = (data: SavedTrip) => {
    const existingTrip = trips.find((t) => t.id === data.id) ?? null;
    const trimmedProject = data.project.trim();
    const trimmedInvoice = data.invoice?.trim() ? data.invoice.trim() : undefined;

    const nextTrip: Trip = {
      id: data.id,
      date: data.date,
      route: data.route,
      project: trimmedProject,
      purpose: data.purpose,
      passengers: data.passengers,
      invoice: trimmedInvoice,
      distance: data.distance,
      co2: calculateCO2(data.distance),
      ratePerKmOverride: data.ratePerKmOverride ?? null,
      specialOrigin: data.specialOrigin ?? "base",
      documents: data.documents,
    };

    setTrips((prev) => {
      const exists = prev.some((t) => t.id === data.id);
      return exists ? prev.map((t) => (t.id === data.id ? { ...t, ...nextTrip } : t)) : [nextTrip, ...prev];
    });

    if (!trimmedProject) return;

    setProjects((prevProjects) => {
      const nextProjects = [...prevProjects];
      const newProjectKey = getProjectKey(trimmedProject);

      const ensureProjectIndex = (name: string) => {
        const key = getProjectKey(name);
        const index = nextProjects.findIndex((p) => getProjectKey(p.name) === key);
        if (index !== -1) return index;

        const newProject: Project = {
          id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
          name: name.trim(),
          producer: "",
          description: "Created via Trip",
          ratePerKm: 0.3,
          starred: false,
          trips: 0,
          totalKm: 0,
          documents: 0,
          invoices: 0,
          estimatedCost: 0,
          shootingDays: 0,
          kmPerDay: 0,
          co2Emissions: 0,
        };

        nextProjects.push(newProject);
        return nextProjects.length - 1;
      };

      const newIndex = ensureProjectIndex(trimmedProject);
      const newProject = nextProjects[newIndex];
      const newContribution = getTripContribution(nextTrip, newProject.ratePerKm);

      if (!existingTrip) {
        nextProjects[newIndex] = applyDeltaToProject(newProject, newContribution);
        return nextProjects;
      }

      const oldProjectKey = getProjectKey(existingTrip.project);
      const projectChanged = oldProjectKey !== newProjectKey;

      if (projectChanged) {
        if (existingTrip.project.trim()) {
          const oldIndex = nextProjects.findIndex((p) => getProjectKey(p.name) === oldProjectKey);
          if (oldIndex !== -1) {
            const oldProject = nextProjects[oldIndex];
            const oldContribution = getTripContribution(existingTrip, oldProject.ratePerKm);
            nextProjects[oldIndex] = applyDeltaToProject(oldProject, negateDelta(oldContribution));
          }
        }

        nextProjects[newIndex] = applyDeltaToProject(nextProjects[newIndex], newContribution);
        return nextProjects;
      }

      const oldContribution = getTripContribution(existingTrip, newProject.ratePerKm);
      const delta = diffDelta(newContribution, oldContribution);
      nextProjects[newIndex] = applyDeltaToProject(newProject, delta);
      return nextProjects;
    });
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
    return matchesProject;
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
  const handleDeleteSelected = () => {
    const tripsToDelete = trips.filter((trip) => selectedIds.has(trip.id));
    setTrips(prev => prev.filter(t => !selectedIds.has(t.id)));

    if (tripsToDelete.length > 0) {
      setProjects((prevProjects) => {
        const nextProjects = [...prevProjects];
        const projectIndexByKey = new Map<string, number>();
        nextProjects.forEach((project, index) => {
          projectIndexByKey.set(getProjectKey(project.name), index);
        });

        for (const trip of tripsToDelete) {
          const key = getProjectKey(trip.project);
          const index = projectIndexByKey.get(key);
          if (index === undefined) continue;
          const project = nextProjects[index];
          const contribution = getTripContribution(trip, project.ratePerKm);
          nextProjects[index] = applyDeltaToProject(project, negateDelta(contribution));
        }

        return nextProjects;
      });
    }

    toast({
      title: t("trips.toastTripsDeletedTitle"),
      description: tf("trips.toastTripsDeletedBody", { count: selectedIds.size }),
    });
    setSelectedIds(new Set());
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
                    <AlertTriangle
                      className="h-4 w-4 shrink-0 text-warning"
                      title={(tripWarnings.byId[trip.id] ?? []).map((w) => w.title).join("\n")}
                    />
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
                  <Map className="w-4 h-4 mr-2" />
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
                <DropdownMenuItem className="text-destructive">
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
        <div className={visibleTrips.length > 40 ? "overflow-x-auto overflow-y-auto max-h-[70vh]" : "overflow-x-auto"}>
          <Table>
            <TableHeader>
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
                      <AlertTriangle
                        className="h-4 w-4 shrink-0 text-warning"
                        title={(tripWarnings.byId[trip.id] ?? []).map((w) => w.title).join("\n")}
                      />
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
                <TableCell className="text-right whitespace-nowrap">{trip.invoice || "-"}</TableCell>
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
                        <Map className="w-4 h-4 mr-2" />
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
                      <DropdownMenuItem className="text-destructive">
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
