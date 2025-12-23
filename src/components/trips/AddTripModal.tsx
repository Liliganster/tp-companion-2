import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, GripVertical, X, MapPin, Calendar, Home, Route, Loader2, Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useProjects } from "@/contexts/ProjectsContext";
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
import { formatLocaleNumber, parseLocaleNumber } from "@/lib/number";
import { getCountryCode } from "@/lib/country-mapping";
import { useI18n } from "@/hooks/use-i18n";

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

type PlacePrediction = { description: string; placeId: string };

function AddressAutocompleteInput({
  value,
  onCommit,
  onDraftChange,
  placeholder,
  disabled,
  className,
  country,
  locationBias,
}: {
  value: string;
  onCommit: (value: string) => void;
  onDraftChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  country?: string;
  locationBias?: { lat: number; lng: number };
}) {
  const { locale } = useI18n();
  const language = useMemo(() => locale.split("-")[0] ?? "en", [locale]);

  // Use robust country mapping
  const countryCode = useMemo(() => getCountryCode(country), [country]);

  const [draft, setDraft] = useState(value);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetched = useRef<string>("");
  const cache = useRef<Map<string, PlacePrediction[]>>(new Map());
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    if (hasFocus) return;
    setDraft(value);
  }, [value, hasFocus]);

  useEffect(() => {
    if (disabled) return;
    if (!hasFocus) return;

    const query = draft.trim();
    if (query.length < 4) {
      setPredictions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      if (lastFetched.current === query) return;
      lastFetched.current = query;

      const cached = cache.current.get(query);
      if (cached) {
        setPredictions(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const body: any = { input: query, language };
        if (countryCode) {
          body.components = `country:${countryCode}`;
          console.log(`[Autocomplete] Country: "${country}" -> Code: "${countryCode}" -> Components: "${body.components}"`);
        } else {
          console.warn(`[Autocomplete] No country code found for: "${country}"`);
        }

        const response = await fetch("/api/google/places-autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => null)) as { predictions?: PlacePrediction[] } | null;
        if (!response.ok || !data || !Array.isArray(data.predictions)) {
          setPredictions([]);
          return;
        }
        const next = data.predictions.filter((p) => p?.description);
        cache.current.set(query, next);
        setPredictions(next);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [draft, language, disabled, hasFocus, countryCode]);

  const showDropdown = hasFocus && !disabled && (loading || predictions.length > 0);

  return (
    <div className="relative">
      <Input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onDraftChange?.(e.target.value);
        }}
        onFocus={() => setHasFocus(true)}
        onBlur={() => {
          setHasFocus(false);
          setPredictions([]);
          onCommit(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setHasFocus(false);
            setPredictions([]);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        </div>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[60] rounded-md border bg-popover p-1 shadow-md">
          <div className="max-h-56 overflow-auto">
            {predictions.map((p) => (
              <button
                key={p.placeId || p.description}
                type="button"
                className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setHasFocus(false);
                  setPredictions([]);

                  // 1. Optimistic update
                  setDraft(p.description);
                  onDraftChange?.(p.description);

                  // 2. Fetch full details to get postal code
                  setLoading(true);
                  try {
                    const res = await fetch("/api/google/place-details", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ placeId: p.placeId, language }),
                    });
                    const data = await res.json();

                    if (res.ok && data?.formattedAddress) {
                      setDraft(data.formattedAddress);
                      onDraftChange?.(data.formattedAddress);
                      onCommit(data.formattedAddress);
                    } else {
                      onCommit(p.description);
                    }
                  } catch (e) {
                    onCommit(p.description);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {p.description}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
  purpose?: string;
  passengers?: number;
  distance?: number;
  ratePerKmOverride?: number | null;
  specialOrigin?: "base" | "continue" | "return";
}

interface AddTripModalProps {
  trigger?: React.ReactNode;
  trip?: TripData | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  previousDestination?: string;
  onSave?: (trip: Required<Pick<TripData, "id" | "date" | "route" | "project" | "purpose" | "passengers" | "distance">> & Pick<TripData, "ratePerKmOverride" | "specialOrigin">) => void;
}

export function AddTripModal({ trigger, trip, open, onOpenChange, previousDestination, onSave }: AddTripModalProps) {
  const { profile } = useUserProfile();
  const { projects, setProjects } = useProjects();
  const { t, locale } = useI18n();
  const [projectOpen, setProjectOpen] = useState(false);
  const settingsRateLabel = useMemo(() => profile.ratePerKm, [profile.ratePerKm]);
  const googleLanguage = useMemo(() => locale.split("-")[0] ?? "en", [locale]);

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
  const previousDestinationEffective = useMemo(() => {
    const value = (previousDestination ?? "").trim();
    return value || baseLocation;
  }, [previousDestination, baseLocation]);

  const getInitialStops = (): Stop[] => {
    const defaultSpecialOrigin: TripData["specialOrigin"] = trip?.specialOrigin ?? "base";

    const originDefault = defaultSpecialOrigin === "base" ? baseLocation : previousDestinationEffective;
    const destinationDefault = baseLocation;

    if (!trip) {
      return [
        { id: "origin", value: "", type: "origin" },
        { id: "destination", value: "", type: "destination" },
      ];
    }

    if (trip?.route && trip.route.length >= 2) {
      return trip.route.map((rawValue, index) => {
        const trimmed = rawValue?.trim?.() ?? "";
        const isFirst = index === 0;
        const isLast = index === trip.route!.length - 1;

        const value = isFirst
          ? trimmed || originDefault
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
  const [date, setDate] = useState("");
  const [distance, setDistance] = useState("");
  const [passengers, setPassengers] = useState("");
  const [project, setProject] = useState("");
  const [purpose, setPurpose] = useState("");
  const [specialOrigin, setSpecialOrigin] = useState<NonNullable<TripData["specialOrigin"]>>("base");
  const [originTouched, setOriginTouched] = useState(false);
  const [destinationTouched, setDestinationTouched] = useState(false);
  const [tripRate, setTripRate] = useState("");
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [locationBias, setLocationBias] = useState<{ lat: number; lng: number } | undefined>(undefined);

  // Fetch coordinates for Base City to use as Autocomplete Bias
  useEffect(() => {
    if (!profile.city || !profile.country) return;

    // Simple caching mechanism in memory for the session could be added if needed,
    // but for now we interact with the API.
    const fetchBaseLocation = async () => {
      try {
        const query = `${profile.city}, ${profile.country}`;
        const res = await fetch("/api/google/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: query, language: googleLanguage }),
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
  }, [profile.city, profile.country, googleLanguage]);

  type SpecialOrigin = NonNullable<TripData["specialOrigin"]>;

  const handleSpecialOriginChange = (next: SpecialOrigin) => {
    const prevSpecialOrigin = specialOrigin;
    setSpecialOrigin(next);

    if (next === "return") {
      setDestinationTouched(false);
    }

    setStops((prev) =>
      prev.map((stop) => {
        if (stop.id === "origin" && isEditing && !originTouched) {
          const originValue = next === "base" ? baseLocation : previousDestinationEffective;
          return { ...stop, value: originValue };
        }
        if (stop.id === "destination") {
          if (next === "return") return { ...stop, value: baseLocation };

          if (!isEditing) {
            if (prevSpecialOrigin === "return" && !destinationTouched) return { ...stop, value: "" };
            return stop;
          }

          if (!destinationTouched) return { ...stop, value: stop.value || baseLocation };
        }
        return stop;
      })
    );
  };

  useEffect(() => {
    if (!isOpen) return;

    const defaultSpecialOrigin: TripData["specialOrigin"] = trip?.specialOrigin ?? "base";

    setStops(getInitialStops());
    stopDraftsRef.current = {};
    setDate(trip?.date || "");
    setDistance(trip?.distance?.toString() || "");
    setPassengers(trip?.passengers?.toString() || "");
    setProject(trip?.project || "");
    setPurpose(trip?.purpose || "");
    setSpecialOrigin(defaultSpecialOrigin || "base");
    setOriginTouched(false);
    setDestinationTouched(false);
    setTripRate(trip?.ratePerKmOverride != null ? formatLocaleNumber(trip.ratePerKmOverride) : "");
  }, [isOpen, trip, baseLocation, previousDestinationEffective]);

  const handleStopDraftChange = useCallback((id: string, value: string) => {
    stopDraftsRef.current[id] = value;
  }, []);

  const originPlaceholder = useMemo(() => {
    const fallback = specialOrigin === "base" ? baseLocation : previousDestinationEffective;
    return fallback || t("tripModal.originPlaceholder");
  }, [specialOrigin, baseLocation, previousDestinationEffective, t]);

  const destinationPlaceholder = useMemo(() => {
    return baseLocation || t("tripModal.destinationPlaceholder");
  }, [baseLocation, t]);

  const getEffectiveRouteValues = useCallback(() => {
    const trimmedStops = stops.map((stop) => (stopDraftsRef.current[stop.id] ?? stop.value).trim());
    const originFallback = specialOrigin === "base" ? baseLocation : previousDestinationEffective;

    const origin = trimmedStops[0] || originFallback;
    const destination =
      specialOrigin === "return" ? baseLocation : trimmedStops[trimmedStops.length - 1] || baseLocation;

    const waypoints = trimmedStops.slice(1, -1).filter(Boolean);
    const routeValues = [origin, ...waypoints, destination].filter(Boolean);
    return { origin, destination, waypoints, routeValues };
  }, [stops, specialOrigin, baseLocation, previousDestinationEffective]);

  const calculateDistance = useCallback(async () => {
    if (!isOpen) return;

    const { origin, destination, waypoints } = getEffectiveRouteValues();
    if (!origin || !destination) return;

    setDistanceLoading(true);
    try {
      const response = await fetch("/api/google/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin,
          destination,
          waypoints,
          language: googleLanguage,
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
  }, [getEffectiveRouteValues, googleLanguage, googleRegion, isOpen]);

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
    if (id === "origin") setOriginTouched(true);
    if (id === "destination") setDestinationTouched(true);
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
                      placeholder="Buscar o crear proyecto..." 
                      value={project}
                      onValueChange={setProject}
                    />
                    <CommandEmpty>
                        <div className="p-2">
                           <p className="text-sm text-muted-foreground mb-2">No encontrado.</p>
                           <Button 
                             variant="secondary" 
                             size="sm" 
                             className="w-full" 
                             onClick={() => setProjectOpen(false)}
                           >
                            Crear "{project}"
                           </Button>
                        </div>
                    </CommandEmpty>
                    {/* 
                       Since Shadcn Command is tricky with "Creation" without controlled input state, 
                       let's use a simplified approach: 
                       List existing projects, and if user types something, we can capture it? 
                       Actually, CommandInput doesn't expose value easily. 
                       Better approach: Just show the list. If they want to create, maybe a "+ New" item at the top 
                       that turns the button into an Input?
                       
                       OR: Use the standard Radix/Shadcn pattern but control the `value` of CommandInput?
                       Use `onValueChange` on CommandInput?
                    */}
                    <CommandGroup>
                      {projects.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.name}
                          onSelect={(currentValue) => {
                            setProject(currentValue);
                            setProjectOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              project === p.name ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {p.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
              {/* Fallback Input for manual override/creation if the above feels restrictive? 
                  Actually, let's just make it an Input with a Datalist style behavior or accept the fact that 
                  creating via Combobox is complex. 
                  
                  Let's try a simpler robust approach:
                  An Input that has a suggestion dropdown (Popover) that opens on focus.
              */}
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

          <DialogClose asChild>
            <Button
              variant="save"
              className="w-full mt-2"
              onClick={() => {
                const distanceValue = parseLocaleNumber(distance) ?? 0;
                const passengersValue = parseLocaleNumber(passengers) ?? 0;
                const rateOverride = parseLocaleNumber(tripRate);
                const { routeValues } = getEffectiveRouteValues();

                const id = trip?.id || (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));

                onSave?.({
                  id,
                  date,
                  route: routeValues,
                  project,
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
