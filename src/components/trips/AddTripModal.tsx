import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, GripVertical, X, MapPin, Calendar, Home, Route } from "lucide-react";
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
  canRemove: boolean;
  disabled?: boolean;
  placeholder?: string;
}

function SortableStop({ stop, onRemove, onChange, canRemove, disabled, placeholder }: SortableStopProps) {
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
          <Input
            value={stop.value}
            onChange={(e) => onChange(stop.id, e.target.value)}
            placeholder={placeholder ?? getPlaceholder()}
            disabled={disabled}
            className="bg-secondary/50 h-8 mt-1"
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
  const isEditing = !!trip;
  const { profile } = useUserProfile();
  const { t } = useI18n();
  const settingsRateLabel = useMemo(() => profile.ratePerKm, [profile.ratePerKm]);
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
  const [date, setDate] = useState("");
  const [distance, setDistance] = useState("");
  const [passengers, setPassengers] = useState("");
  const [project, setProject] = useState("");
  const [purpose, setPurpose] = useState("");
  const [specialOrigin, setSpecialOrigin] = useState("base");
  const [originTouched, setOriginTouched] = useState(false);
  const [destinationTouched, setDestinationTouched] = useState(false);
  const [tripRate, setTripRate] = useState("");

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

  const originPlaceholder = useMemo(() => {
    const fallback = specialOrigin === "base" ? baseLocation : previousDestinationEffective;
    return fallback || t("tripModal.originPlaceholder");
  }, [specialOrigin, baseLocation, previousDestinationEffective, t]);

  const destinationPlaceholder = useMemo(() => {
    return baseLocation || t("tripModal.destinationPlaceholder");
  }, [baseLocation, t]);

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
    // Insert before destination
    setStops((prev) => {
      const newStops = [...prev];
      newStops.splice(prev.length - 1, 0, newStop);
      return newStops;
    });
  };

  const removeStop = (id: string) => {
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
              <Label htmlFor="project">{t("tripModal.project")}</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder={t("tripModal.selectProject")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Film Production XY">Film Production XY</SelectItem>
                  <SelectItem value="Client ABC">Client ABC</SelectItem>
                  <SelectItem value="Internal">Internal</SelectItem>
                </SelectContent>
              </Select>
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
                        canRemove={stops.length > 2}
                        placeholder={
                          stop.type === "origin"
                            ? originPlaceholder
                            : stop.type === "destination"
                              ? destinationPlaceholder
                              : undefined
                        }
                        disabled={stop.type === "destination" && specialOrigin === "return"}
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
              onClick={() => {
                // TODO: Calculate distance from route
                setDistance("100");
              }}
            >
              <Route className="w-5 h-5" />
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
                const trimmedStops = stops.map((s) => s.value.trim());
                const originFallback = specialOrigin === "base" ? baseLocation : previousDestinationEffective;
                const origin = trimmedStops[0] || originFallback;
                const destination =
                  specialOrigin === "return"
                    ? baseLocation
                    : trimmedStops[trimmedStops.length - 1] || baseLocation;
                const middleStops = trimmedStops.slice(1, -1).filter(Boolean);
                const routeValues = [origin, ...middleStops, destination].filter(Boolean);

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
