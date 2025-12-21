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
}

function SortableStop({ stop, onRemove, onChange, canRemove }: SortableStopProps) {
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
        return "Origin";
      case "destination":
        return "Destination";
      default:
        return "Stop";
    }
  };

  const getPlaceholder = () => {
    switch (stop.type) {
      case "origin":
        return "Start location";
      case "destination":
        return "End location";
      default:
        return "Intermediate stop";
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
            placeholder={getPlaceholder()}
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
}

interface AddTripModalProps {
  trigger?: React.ReactNode;
  trip?: TripData | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSave?: (trip: Required<Pick<TripData, "id" | "date" | "route" | "project" | "purpose" | "passengers" | "distance">> & Pick<TripData, "ratePerKmOverride">) => void;
}

export function AddTripModal({ trigger, trip, open, onOpenChange, onSave }: AddTripModalProps) {
  const isEditing = !!trip;
  const { profile } = useUserProfile();
  const settingsRateLabel = useMemo(() => profile.ratePerKm, [profile.ratePerKm]);
  
  const getInitialStops = (): Stop[] => {
    if (trip?.route && trip.route.length >= 2) {
      return trip.route.map((value, index) => ({
        id: index === 0 ? "origin" : index === trip.route!.length - 1 ? "destination" : `stop-${index}`,
        value,
        type: index === 0 ? "origin" : index === trip.route!.length - 1 ? "destination" : "stop",
      }));
    }
    return [
      { id: "origin", value: "", type: "origin" },
      { id: "destination", value: "", type: "destination" },
    ];
  };

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined && !!onOpenChange;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen;

  const [stops, setStops] = useState<Stop[]>(() => getInitialStops());
  const [date, setDate] = useState("");
  const [distance, setDistance] = useState("");
  const [passengers, setPassengers] = useState("0");
  const [project, setProject] = useState("");
  const [purpose, setPurpose] = useState("");
  const [specialOrigin, setSpecialOrigin] = useState("base");
  const [tripRate, setTripRate] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setStops(getInitialStops());
    setDate(trip?.date || "");
    setDistance(trip?.distance?.toString() || "");
    setPassengers(trip?.passengers?.toString() || "0");
    setProject(trip?.project || "");
    setPurpose(trip?.purpose || "");
    setSpecialOrigin("base");
    setTripRate(trip?.ratePerKmOverride != null ? formatLocaleNumber(trip.ratePerKmOverride) : "");
  }, [isOpen, trip]);

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
          <DialogTitle>{isEditing ? "Edit Trip" : "Add New Trip"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="date">Date</Label>
              <Input 
                id="date" 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-secondary/50 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:order-first [&::-webkit-calendar-picker-indicator]:mr-2" 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project">Project</Label>
              <Select value={project} onValueChange={setProject}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select project" />
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
                <Label>Route</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addStop}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Stop
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
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <p className="text-xs text-muted-foreground">
                Drag to reorder stops
              </p>
            </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Origen especial</Label>
              <Select value={specialOrigin} onValueChange={setSpecialOrigin}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Salida desde mi dirección base</SelectItem>
                  <SelectItem value="continue">Continuar desde el último destino</SelectItem>
                  <SelectItem value="return">Regresar a mi dirección base (desde el último destino)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="passengers">Passengers</Label>
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

          <div className="flex items-end gap-2">
            <div className="grid gap-2 flex-1">
              <Label htmlFor="distance">Distancia (km)</Label>
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
            <div className="grid gap-2 flex-1">
              <Label htmlFor="tripRate">Tarifa de viaje (€/km)</Label>
              <Input 
                id="tripRate" 
                type="text" 
                value={tripRate}
                onChange={(e) => setTripRate(e.target.value)}
                placeholder={settingsRateLabel}
                className="bg-secondary/50" 
              />
              <p className="text-xs text-muted-foreground">
                Deja este campo en blanco para usar la tarifa de Ajustes.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="purpose">Purpose</Label>
            <Input 
              id="purpose" 
              placeholder="Trip purpose" 
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

                const routeValues = stops.map((s) => s.value.trim()).filter(Boolean);

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
                });
              }}
            >
              {isEditing ? "Update Trip" : "Save Trip"}
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
