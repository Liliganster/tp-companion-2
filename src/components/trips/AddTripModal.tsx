import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, GripVertical, X, MapPin, Calendar, Home, Route, Loader2, Check, ChevronsUpDown, FileUp } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, uuidv4 } from "@/lib/utils";
import { useProjects } from "@/contexts/ProjectsContext";
import { useTrips } from "@/contexts/TripsContext";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import tripHeaderImage from "@/assets/trip-modal-header.jpg";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatLocaleNumber, parseLocaleNumber } from "@/lib/number";
import { getCountryCode } from "@/lib/country-mapping";
import { useI18n } from "@/hooks/use-i18n";
import { AddressAutocompleteInput } from "@/components/google/AddressAutocompleteInput";

interface Stop {
  id: string;
  value: string;
  type: "origin" | "stop" | "destination";
}

interface SortableStopProps {
  stop: Stop;
  onRemove: (id: string) => void;
  onChange: (id: string, value: string) => void;
  onDraftChange?: (id: string, value: string) => void;
  canRemove: boolean;
  disabled?: boolean;
  placeholder?: string;
  country?: string;
  locationBias?: { lat: number; lng: number };
}

function SortableStop({ stop, onRemove, onChange, onDraftChange, canRemove, disabled, placeholder, country, locationBias }: SortableStopProps) {
  const { t } = useI18n();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getLabel = () => {
    switch (stop.type) {
      case "origin":
        return t("tripModal.origin");
      case "destination":
        return t("tripModal.destination");
      default:
        return t("tripModal.stop");
    }
  };

  const getPlaceholder = () => {
    switch (stop.type) {
      case "origin":
        return t("tripModal.originPlaceholder");
      case "destination":
        return t("tripModal.destinationPlaceholder");
      default:
        return t("tripModal.stopPlaceholder");
    }
  };

  const getIcon = () => {
    switch (stop.type) {
      case "origin":
        return <Home className="w-4 h-4 shrink-0 text-amber-400" />;
      case "destination":
        return <Home className="w-4 h-4 shrink-0 text-green-400" />;
      default:
        return <MapPin className="w-4 h-4 shrink-0 text-white" />;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-secondary/30 rounded-lg p-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-secondary/50 rounded"
        type="button"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <div className="flex items-center gap-2 flex-1">
        {getIcon()}
        <div className="flex-1">
          <span className="text-xs text-muted-foreground">{getLabel()}</span>
          <AddressAutocompleteInput
            value={stop.value}
            onCommit={(value) => onChange(stop.id, value)}
            onDraftChange={(value) => onDraftChange?.(stop.id, value)}
            placeholder={placeholder ?? getPlaceholder()}
            disabled={disabled}
            className="bg-secondary/50 h-8 mt-1"
            country={country}
            locationBias={locationBias}
          />
        </div>
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove(stop.id)}
          className="p-1 hover:bg-destructive/20 rounded text-destructive"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

interface TripData {
  id?: string;
  date?: string;
  route?: string[];
  project?: string;
  projectId?: string; // Added
  purpose?: string;
  passengers?: number;
  distance?: number;
  ratePerKmOverride?: number | null;
  specialOrigin?: "base" | "continue" | "return";
}

interface AddTripModalProps {
  trigger?: React.ReactNode;
  trip?: TripData | null;
  prefill?: Partial<TripData> | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  previousDestination?: string;
  onSave?: (trip: Required<Pick<TripData, "id" | "date" | "route" | "project" | "purpose" | "passengers" | "distance">> & Pick<TripData, "ratePerKmOverride" | "specialOrigin" | "projectId">) => void;
}

export function AddTripModal({ trigger, trip, prefill, open, onOpenChange, previousDestination, onSave }: AddTripModalProps) {
  const { profile } = useUserProfile();
  const { getAccessToken } = useAuth();
  const { projects, addProject } = useProjects();
  const { trips } = useTrips();
  const { t, tf, locale } = useI18n();
  const isEditing = Boolean(trip);
  const seedTrip = trip ?? prefill ?? null;
  const [projectOpen, setProjectOpen] = useState(false);
  const settingsRateLabel = useMemo(() => profile.ratePerKm, [profile.ratePerKm]);

  const projectOptions = useMemo(() => {
    const byLower = new Map<string, string>();

    for (const p of projects) {
      const name = (p?.name ?? "").trim();
      if (!name) continue;
      byLower.set(name.toLowerCase(), name);
    }

    // Include projects from trips that might not be in the project list (legacy/orphan)
    for (const tripItem of trips) {
      const name = (tripItem?.project ?? "").trim();
      if (!name) continue;
      if (!byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name);
    }

    return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b, locale, { sensitivity: "base" }));
  }, [projects, trips, locale]);

  const createProjectIfNeeded = useCallback(
    async (rawName: string) => {
      const trimmedName = rawName.trim();
      if (!trimmedName) return;

      const lower = trimmedName.toLowerCase();
      // Check against current projects list
      const exists = projects.some((p) => (p?.name ?? "").trim().toLowerCase() === lower);
      if (exists) return;

      const newProject = {
        id: uuidv4(),
        name: trimmedName,
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

      await addProject(newProject);
      toast.success(`Proyecto "${trimmedName}" creado`);
    },
    [projects, addProject]
  );

  const googleRegion = useMemo(() => {
    const normalized = profile.country.trim().toLowerCase();
    const countryMap: Record<string, string> = {
      "austria": "at",
      "österreich": "at",
      "germany": "de",
      "deutschland": "de",
      "spain": "es",
      "españa": "es",
      "italy": "it",
      "italia": "it",
      "france": "fr",
      "switzerland": "ch",
      "schweiz": "ch",
      "suisse": "ch",
      "svizzera": "ch",
      "belgium": "be",
      "belgique": "be",
      "belgië": "be",
      "netherlands": "nl",
      "nederland": "nl",
      "portugal": "pt",
      "uk": "gb",
      "united kingdom": "gb",
      "poland": "pl",
      "polska": "pl",
      "czech republic": "cz",
      "czechia": "cz",
      "česko": "cz",
      "hungary": "hu",
      "magyarország": "hu",
      "slovakia": "sk",
      "slovensko": "sk",
      "slovenia": "si",
      "slovenija": "si",
      "croatia": "hr",
      "hrvatska": "hr",
    };
    return countryMap[normalized];
  }, [profile.country]);

  const baseLocation = useMemo(() => {
    const parts = [profile.baseAddress, profile.city, profile.country].map((p) => p.trim()).filter(Boolean);
    return parts.join(", ");
  }, [profile.baseAddress, profile.city, profile.country]);

  const parseTripDateToTime = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // YYYY-MM-DD (preferred)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const time = Date.parse(trimmed);
      return Number.isFinite(time) ? time : null;
    }

    // DD/MM/YYYY (legacy strings)
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      const year = Number(dmy[3]);
      if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
      if (year < 1900 || year > 3000) return null;
      if (month < 1 || month > 12) return null;
      if (day < 1 || day > 31) return null;
      return Date.UTC(year, month - 1, day);
    }

    const fallback = Date.parse(trimmed);
    return Number.isFinite(fallback) ? fallback : null;
  }, []);

  const resolvePreviousDestinationForDate = useCallback(
    (targetDate: string) => {
      const parsedTarget = parseTripDateToTime(targetDate);
      if (parsedTarget == null) {
        const fallback = (previousDestination ?? "").trim();
        return fallback || baseLocation;
      }

      // "Continuación" depends on the trip date: use the destination of the most recent trip strictly BEFORE targetDate.
      const previousTrip = trips.find((candidate) => {
        if (candidate.id === trip?.id) return false;
        const parsedCandidate = parseTripDateToTime(candidate.date);
        return parsedCandidate != null && parsedCandidate < parsedTarget;
      });

      if (!previousTrip) {
        const fallback = (previousDestination ?? "").trim();
        return baseLocation || fallback;
      }

      const route = Array.isArray(previousTrip.route) ? previousTrip.route : [];
      const destination = route.length > 0 ? String(route[route.length - 1] ?? "").trim() : "";
      return destination || baseLocation;
    },
    [baseLocation, parseTripDateToTime, previousDestination, trip?.id, trips]
  );

  const getInitialStops = (): Stop[] => {
    const defaultSpecialOrigin: TripData["specialOrigin"] = seedTrip?.specialOrigin ?? "base";

    const originDefault = defaultSpecialOrigin === "base" ? baseLocation : resolvePreviousDestinationForDate(seedTrip?.date || "");
    const destinationDefault = baseLocation;

    if (!seedTrip) {
      return [
        { id: "origin", value: "", type: "origin" },
        { id: "destination", value: "", type: "destination" },
      ];
    }

    if (seedTrip?.route && seedTrip.route.length >= 2) {
      return seedTrip.route.map((rawValue, index) => {
        const trimmed = rawValue?.trim?.() ?? "";
        const isFirst = index === 0;
        const isLast = index === seedTrip.route!.length - 1;

        const value = isFirst
          ? defaultSpecialOrigin === "base"
            ? trimmed || originDefault
            : originDefault
          : isLast
            ? defaultSpecialOrigin === "return"
              ? baseLocation
              : trimmed || destinationDefault
            : trimmed;

        return {
          id: isFirst ? "origin" : isLast ? "destination" : `stop-${index}`,
          value,
          type: isFirst ? "origin" : isLast ? "destination" : "stop",
        };
      });
    }

    return [
      { id: "origin", value: originDefault || baseLocation, type: "origin" },
      { id: "destination", value: destinationDefault || baseLocation, type: "destination" },
    ];
  };

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined && !!onOpenChange;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen;

  const [stops, setStops] = useState<Stop[]>(() => getInitialStops());
  const stopDraftsRef = useRef<Record<string, string>>({});
  const destinationBeforeReturnRef = useRef<string | null>(null);
  const [date, setDate] = useState("");
  const [distance, setDistance] = useState("");
  const [passengers, setPassengers] = useState("");
  const [project, setProject] = useState("");
  const [purpose, setPurpose] = useState("");
  const [specialOrigin, setSpecialOrigin] = useState<NonNullable<TripData["specialOrigin"]>>("base");
  const [tripRate, setTripRate] = useState("");
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [locationBias, setLocationBias] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);

  // Fetch coordinates for Base City to use as Autocomplete Bias
  useEffect(() => {
    if (!profile.city || !profile.country) return;

    // Simple caching mechanism in memory for the session could be added if needed,
    // but for now we interact with the API.
    const fetchBaseLocation = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const query = `${profile.city}, ${profile.country}`;
        const res = await fetch("/api/google/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ address: query, region: googleRegion }),
        });
        const data = await res.json();
        if (res.ok && data?.location) {
          setLocationBias(data.location);
        }
      } catch (e) {
        // ignore errors
      }
    };

    fetchBaseLocation();
  }, [getAccessToken, profile.city, profile.country, googleRegion]);

  type SpecialOrigin = NonNullable<TripData["specialOrigin"]>;

  const handleSpecialOriginChange = (next: SpecialOrigin) => {
    const prevSpecialOrigin = specialOrigin;
    const nextOriginValue = next === "base" ? baseLocation : resolvePreviousDestinationForDate(date);

    // Switching into "return" forces destination to base, so keep the user's last destination to restore later.
    if (next === "return" && prevSpecialOrigin !== "return") {
      const currentDestination =
        (stopDraftsRef.current.destination ?? stops.find((s) => s.id === "destination")?.value ?? "").trim();
      destinationBeforeReturnRef.current = currentDestination || null;
    }

    setSpecialOrigin(next);

    setStops((prev) =>
      prev.map((stop) => {
        // Special origin drives the origin value: base -> baseLocation, continue/return -> previousDestination.
        if (stop.id === "origin") {
          stopDraftsRef.current.origin = nextOriginValue;
          return { ...stop, value: nextOriginValue };
        }
        if (stop.id === "destination") {
          if (next === "return") {
            stopDraftsRef.current.destination = baseLocation;
            return { ...stop, value: baseLocation };
          }

          if (prevSpecialOrigin === "return" && next !== "return") {
            const restored = destinationBeforeReturnRef.current ?? "";
            if (restored) stopDraftsRef.current.destination = restored;
            else delete stopDraftsRef.current.destination;
            return { ...stop, value: restored };
          }
        }
        return stop;
      })
    );
  };

  useEffect(() => {
    if (!isOpen) return;

    const defaultSpecialOrigin: TripData["specialOrigin"] = seedTrip?.specialOrigin ?? "base";

    setStops(getInitialStops());
    stopDraftsRef.current = {};
    destinationBeforeReturnRef.current = null;
    setDate(seedTrip?.date || "");
    setDistance(seedTrip?.distance?.toString() || "");
    setPassengers(seedTrip?.passengers?.toString() || "");
    setProject(seedTrip?.project || "");
    setPurpose(seedTrip?.purpose || "");
    setSpecialOrigin(defaultSpecialOrigin || "base");
    const rateOverride = seedTrip?.ratePerKmOverride;
    setTripRate(rateOverride != null ? formatLocaleNumber(rateOverride) : "");
    setSaveTemplateOpen(false);
    setTemplateName("");
  }, [isOpen, trip, prefill, baseLocation, resolvePreviousDestinationForDate]);

  const handleStopDraftChange = useCallback((id: string, value: string) => {
    stopDraftsRef.current[id] = value;
  }, []);

  const originPlaceholder = useMemo(() => {
    const fallback = specialOrigin === "base" ? baseLocation : resolvePreviousDestinationForDate(date);
    return fallback || t("tripModal.originPlaceholder");
  }, [specialOrigin, baseLocation, resolvePreviousDestinationForDate, date, t]);

  const destinationPlaceholder = useMemo(() => {
    return baseLocation || t("tripModal.destinationPlaceholder");
  }, [baseLocation, t]);

  const getEffectiveRouteValues = useCallback(() => {
    const trimmedStops = stops.map((stop) => (stopDraftsRef.current[stop.id] ?? stop.value).trim());
    const originFallback = specialOrigin === "base" ? baseLocation : resolvePreviousDestinationForDate(date);

    // When using special origin (continuation/return), the origin is always derived from the previous trip destination.
    const origin = specialOrigin === "base" ? trimmedStops[0] || originFallback : originFallback;
    const destination =
      specialOrigin === "return" ? baseLocation : trimmedStops[trimmedStops.length - 1] || baseLocation;

    const waypoints = trimmedStops.slice(1, -1).filter(Boolean);
    const routeValues = [origin, ...waypoints, destination].filter(Boolean);
    return { origin, destination, waypoints, routeValues };
  }, [stops, specialOrigin, baseLocation, resolvePreviousDestinationForDate, date]);

  useEffect(() => {
    if (!isOpen) return;
    if (specialOrigin === "base") return;

    const nextOrigin = resolvePreviousDestinationForDate(date);
    if (!nextOrigin) return;

    stopDraftsRef.current.origin = nextOrigin;
    setStops((prev) => prev.map((stop) => (stop.id === "origin" ? { ...stop, value: nextOrigin } : stop)));
  }, [date, isOpen, resolvePreviousDestinationForDate, specialOrigin]);

  const calculateDistance = useCallback(async () => {
    if (!isOpen) return;

    const { origin, destination, waypoints } = getEffectiveRouteValues();
    if (!origin || !destination) return;

    setDistanceLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch("/api/google/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          origin,
          destination,
          waypoints,
          region: googleRegion,
        }),
      });

      const data = (await response.json().catch(() => null)) as { totalDistanceMeters?: number } | null;
      const meters = typeof data?.totalDistanceMeters === "number" ? data.totalDistanceMeters : null;
      if (!response.ok || meters == null) return;

      const km = Math.round((meters / 1000) * 10) / 10;
      setDistance(String(km));
    } catch {
      // ignore
    } finally {
      setDistanceLoading(false);
    }
  }, [getAccessToken, getEffectiveRouteValues, googleRegion, isOpen]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setStops((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Update types based on position
        return newItems.map((item, index) => ({
          ...item,
          type: index === 0 ? "origin" : index === newItems.length - 1 ? "destination" : "stop",
        }));
      });
    }
  };

  const addStop = () => {
    const newStop: Stop = {
      id: `stop-${Date.now()}`,
      value: "",
      type: "stop",
    };
    stopDraftsRef.current[newStop.id] = "";
    // Insert before destination
    setStops((prev) => {
      const newStops = [...prev];
      newStops.splice(prev.length - 1, 0, newStop);
      return newStops;
    });
  };

  const removeStop = (id: string) => {
    delete stopDraftsRef.current[id];
    setStops((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      // Update types
      return filtered.map((item, index) => ({
        ...item,
        type: index === 0 ? "origin" : index === filtered.length - 1 ? "destination" : "stop",
      }));
    });
  };

  const updateStop = (id: string, value: string) => {
    stopDraftsRef.current[id] = value;
    setStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, value } : s))
    );
  };

  const dialogContent = (
    <DialogContent className="glass max-w-lg max-h-[90vh] overflow-y-auto p-0">
      {/* Header Image */}
      <div className="relative h-32 overflow-hidden rounded-t-lg">
        <img
          src={tripHeaderImage}
          alt="Business trip"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
      </div>

        <div className="px-6 pb-6">
          <DialogHeader className="pb-4">
            <DialogTitle>{isEditing ? t("tripModal.editTitle") : t("tripModal.addTitle")}</DialogTitle>
            <DialogDescription className="sr-only">
              {isEditing ? t("tripModal.editTitle") : t("tripModal.addTitle")}
            </DialogDescription>
          </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="date">{t("tripModal.date")}</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-secondary/50 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:order-first [&::-webkit-calendar-picker-indicator]:mr-2"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("tripModal.project")}</Label>
              <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={projectOpen}
                    className="w-full justify-between bg-secondary/50 font-normal"
                  >
                    {project || t("tripModal.selectProject")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
	                  <Command>
	                    <CommandInput 
	                      placeholder={t("tripModal.projectSearchPlaceholder")}
	                      value={project}
	                      onValueChange={setProject}
	                    />
	                    <CommandList>
                      <CommandEmpty>
                          <div className="p-2 space-y-2">
                             <p className="text-sm text-muted-foreground">{t("tripModal.projectNotFound")}</p>
                             <Button 
                               variant="secondary" 
                               size="sm" 
                               className="w-full" 
                               disabled={!project.trim()}
                               onClick={async () => {
                                 await createProjectIfNeeded(project);
                                 setProject(project.trim());
                                 setProjectOpen(false);
                               }}
                             >
                              {tf("tripModal.createProjectNamed", { name: project })}
                             </Button>
                             <Button 
                               variant="outline" 
                               size="sm" 
                               className="w-full" 
                               disabled={!project.trim()}
                               onClick={() => {
                                 // Just use the string as project/client name
                                 setProject(project.trim());
                                 setProjectOpen(false);
                               }}
                             >
                              {tf("tripModal.useAsClient", { name: project })}
                             </Button>
                          </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {projectOptions.map((name) => (
                          <CommandItem
                            key={name.toLowerCase()}
                            value={name}
                            onSelect={() => {
                              setProject(name);
                              setProjectOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                project.trim().toLowerCase() === name.toLowerCase() ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Draggable Route Stops */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>{t("tripModal.route")}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addStop}
                className="h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                {t("tripModal.addStop")}
              </Button>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={stops.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {stops.map((stop) => (
                    <SortableStop
                      key={stop.id}
                      stop={stop}
                      onRemove={removeStop}
                      onChange={updateStop}
                      onDraftChange={handleStopDraftChange}
                      canRemove={stops.length > 2}
                      placeholder={
                        stop.type === "origin"
                          ? originPlaceholder
                          : stop.type === "destination"
                            ? destinationPlaceholder
                            : undefined
                      }
                      disabled={stop.type === "destination" && specialOrigin === "return"}
                      country={profile.country}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>{t("tripModal.specialOrigin")}</Label>
              <Select value={specialOrigin} onValueChange={(value) => handleSpecialOriginChange(value as SpecialOrigin)}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">{t("tripModal.specialOriginBase")}</SelectItem>
                  <SelectItem value="continue">{t("tripModal.specialOriginContinue")}</SelectItem>
                  <SelectItem value="return">{t("tripModal.specialOriginReturn")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="passengers">{t("tripModal.passengers")}</Label>
              <Input
                id="passengers"
                type="number"
                placeholder="0"
                value={passengers}
                onChange={(e) => setPassengers(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="grid gap-2">
              <Label htmlFor="distance">{t("tripModal.distance")}</Label>
              <Input
                id="distance"
                type="number"
                placeholder="0"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => void calculateDistance()}
              disabled={distanceLoading}
            >
              {distanceLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Route className="w-5 h-5" />}
            </Button>
            <div className="grid gap-2">
              <Label htmlFor="tripRate">{t("tripModal.rate")}</Label>
              <Input
                id="tripRate"
                type="text"
                value={tripRate}
                onChange={(e) => setTripRate(e.target.value)}
                placeholder={settingsRateLabel}
                className="bg-secondary/50"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="purpose">{t("tripModal.purpose")}</Label>
            <Input
              id="purpose"
              placeholder={t("tripModal.purposePlaceholder")}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="bg-secondary/50"
            />
          </div>

          </div>

          <div className="flex items-center gap-2 mt-2">
            <Popover open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2" type="button">
                  <FileUp className="w-4 h-4" />
                  {t("advancedRoutes.saveAsTemplate") || "Convertir en plantilla"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="start">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium leading-none">{t("advancedRoutes.createTemplateTitle") || "Crear plantilla"}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t("advancedRoutes.createTemplateDesc") || "Guarda esta ruta para usarla en futuros viajes."}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="templateName">{t("advancedRoutes.templateName") || "Nombre de la plantilla"}</Label>
                    <Input
                      id="templateName"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Ej. Visita cliente X"
                      className="bg-secondary/50"
                    />
                  </div>
                  <Button 
                    variant="add" 
                    size="sm" 
                    disabled={templateLoading || !templateName.trim()}
                    onClick={async () => {
                      if (!supabase || !profile) return;
                      const { routeValues, waypoints, origin, destination } = getEffectiveRouteValues();
                      
                      if (!origin || !destination) {
                        toast.error("La ruta debe tener origen y destino");
                        return;
                      }

                      setTemplateLoading(true);
                      try {
                        const { data: userData } = await supabase.auth.getUser();
                        const userId = userData?.user?.id;

                        if (!userId) throw new Error("No autenticado");

                        const distanceVal = parseLocaleNumber(distance) ?? 0;
                        // Calculate estimated time roughly (e.g. 60km/h avg speed) if not available, or just leave 0
                        // Since we don't have duration here easily without calling API, we default to 0.

                        const { error } = await supabase.from("route_templates").insert({
                          user_id: userId,
                          name: templateName.trim(),
                          category: "business", // Default
                          start_location: origin,
                          end_location: destination, 
                          waypoints: waypoints,
                          distance_km: distanceVal,
                          estimated_time_min: 0,
                          description: project || purpose || null,
                          uses: 0
                        });

                        if (error) throw error;

                        toast.success(t("advancedRoutes.toastCreated") || "Plantilla guardada");
                        setSaveTemplateOpen(false);
                      } catch (e) {
                         console.error(e);
                         toast.error("Error al guardar plantilla");
                      } finally {
                        setTemplateLoading(false);
                      }
                    }}
                  >
                    {templateLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                     {t("advancedRoutes.save") || "Guardar"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <DialogClose asChild>
              <Button
                variant="save"
                className="flex-1"
              onClick={async (event) => {
                const distanceValue = parseLocaleNumber(distance) ?? 0;
                const passengersValue = parseLocaleNumber(passengers) ?? 0;
                const rateOverride = parseLocaleNumber(tripRate);
                const { routeValues } = getEffectiveRouteValues();

                if (!date.trim()) {
                  event.preventDefault();
                  toast.error("Selecciona una fecha");
                  return;
                }

                const routeNonEmpty = routeValues.map((v) => v.trim()).filter(Boolean);
                if (routeNonEmpty.length < 2) {
                  event.preventDefault();
                  toast.error("Completa origen y destino");
                  return;
                }

                // 1. Resolve Trip ID
                const id = trip?.id || uuidv4();

                // 2. Resolve Project ID
                const trimmedProject = project.trim();
                let projectId: string | undefined = undefined;

                if (trimmedProject) {
                  const existing = projects.find(p => p.name.trim().toLowerCase() === trimmedProject.toLowerCase());
                  if (existing) {
                    projectId = existing.id;
                  } else {
                    // Auto-create project if it doesn't exist
                    const newId = uuidv4();
                    try {
                      await addProject({
                        id: newId,
                        name: trimmedProject,
                        ratePerKm: parseLocaleNumber(profile.ratePerKm) ?? 0,
                        starred: false,
                        trips: 0,
                        totalKm: 0,
                        documents: 0,
                        invoices: 0,
                        estimatedCost: 0,
                        shootingDays: 0,
                        kmPerDay: 0,
                        co2Emissions: 0,
                        createdAt: new Date().toISOString()
                      });
                      projectId = newId;
                      toast.success(`Proyecto "${trimmedProject}" creado`);
                    } catch (err) {
                      console.error("Failed to auto-create project:", err);
                    }
                  }
                }

                // 3. Save Trip
                onSave?.({
                  id,
                  date,
                  route: routeValues,
                  project: trimmedProject,
                  projectId, // Added correct ID
                  purpose,
                  passengers: Math.max(0, Math.floor(passengersValue)),
                  distance: Math.max(0, distanceValue),
                  ratePerKmOverride: rateOverride == null ? null : Math.max(0, rateOverride),
                  specialOrigin,
                });
              }}
            >
              {isEditing ? t("tripModal.update") : t("tripModal.save")}
            </Button>
          </DialogClose>
        </div>
      </div>
    </DialogContent>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {dialogContent}
    </Dialog>
  );
}
