import { useEffect, useMemo, useState, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Calendar,
  RefreshCw,
  ExternalLink,
  Check,
  Plus,
  ChevronLeft,
  ChevronRight,
  Car,
  MapPin,
  Clock,
  FileText,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTrips } from "@/contexts/TripsContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { useNavigate } from "react-router-dom";
import { uuidv4 } from "@/lib/utils";
import { Trip } from "@/contexts/TripsContext";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  calendar: string;
  color: string;
  location?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
}

type CalendarInfo = {
  id: string;
  name: string;
  color: string;
};

type CreateEventForm = {
  calendarId: string;
  title: string;
  startLocal: string;
  endLocal: string;
};

const ENABLED_CALENDARS_STORAGE_KEY = "calendar.enabledIds";
const CALENDAR_COLOR_CLASSES = ["bg-primary", "bg-accent", "bg-success"];

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toISODateKey(value: string): string | null {
  if (!value) return null;
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(value);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return null;
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export default function CalendarPage() {
  const { t, tf, locale } = useI18n();
  const { getAccessToken } = useAuth();
  const { addTrip } = useTrips();
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const { projects, addProject } = useProjects();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [isConnected, setIsConnected] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [enabledCalendarIds, setEnabledCalendarIds] = useState<Set<string>>(() => new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState<CreateEventForm>({
    calendarId: "primary",
    title: "",
    startLocal: "",
    endLocal: "",
  });
  const [needsReconnect, setNeedsReconnect] = useState(false);
  
  // Import event as trip
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Prevent duplicate API calls
  const lastEventsRefreshRef = useRef<string>("");
  const eventsRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();
  
  const firstDayOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  ).getDay();

  const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: adjustedFirstDay }, (_, i) => i);

  // Extraer ubicaciones del evento - siempre usa dirección base
  const extractLocationsFromEvent = (event: CalendarEvent): string[] => {
    // Construir dirección base exactamente igual que AddTripModal
    const baseLocation = [profile.baseAddress, profile.city, profile.country]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(", ");
    
    if (!baseLocation) {
      return [];
    }
    
    // Extraer ubicación del evento
    const eventLocation = event.location?.trim();
    
    if (!eventLocation) {
      // Si no hay ubicación en el evento, viaje de ida y vuelta a la base
      return [baseLocation, baseLocation];
    }
    
    // Viaje: base -> ubicación del evento -> base (exactamente como AddTripModal con waypoints)
    return [baseLocation, eventLocation, baseLocation];
  };

  // Calcular distancia entre ubicaciones usando Google Directions API
  const calculateDistance = async (route: string[]): Promise<number> => {
    if (route.length < 2) return 0;
    
    try {
      const token = await getAccessToken();
      if (!token) return 0;
      
      const origin = route[0];
      const destination = route[route.length - 1];
      const waypoints = route.slice(1, -1); // Paradas intermedias
      
      console.log("Calculating distance with:", { origin, destination, waypoints });
      
      const response = await fetch("/api/google/directions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          origin,
          destination,
          waypoints,
          region: profile.country?.toLowerCase() || "de"
        }),
      });
      
      const data: any = await response.json().catch(() => null);
      console.log("Distance API response:", data);
      
      if (!response.ok || !data?.totalDistanceMeters) {
        console.error("Distance calculation failed:", response.status, data);
        return 0;
      }
      
      // Convertir metros a kilómetros
      const distanceKm = Math.round(data.totalDistanceMeters / 1000);
      return distanceKm;
    } catch (error) {
      console.error("Error calculating distance:", error);
      return 0;
    }
  };

  // Importar evento como viaje
  const handleImportEventAsTrip = async (event: CalendarEvent) => {
    setImporting(true);
    try {
      // Verificar que existe dirección base
      if (!profile.baseAddress || !profile.city || !profile.country) {
        toast.error(t("calendar.importNeedBaseAddress"));
        setImporting(false);
        return;
      }
      
      // Extraer ubicaciones
      const route = extractLocationsFromEvent(event);
      
      if (route.length < 2) {
        toast.error(t("calendar.importNeedBaseAddress"));
        setImporting(false);
        return;
      }
      
      // Calcular distancia
      const distance = await calculateDistance(route);
      
      if (distance === 0) {
        toast.error(t("calendar.importNoDistance"));
        setImporting(false);
        return;
      }
      
      // Crear proyecto "Unknown" con el título del evento como producer
      const existingProject = projects.find((p) => p.name === "Unknown");
      let projectId: string | undefined;
      
      if (!existingProject) {
        // Crear nuevo proyecto
        const newProject = {
          id: uuidv4(),
          name: "Unknown",
          producer: event.title.trim(),
          description: "Imported from Google Calendar",
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
        
        const result = await addProject(newProject);
        projectId = newProject.id;
      } else {
        projectId = existingProject.id;
      }
      
      // Crear viaje con el proyecto
      const tripId = uuidv4();
      const tripData: Trip = {
        id: tripId,
        date: event.date,
        route,
        project: "Unknown",
        projectId: projectId,
        purpose: event.description?.substring(0, 500) || "",
        passengers: 0,
        distance,
        co2: 0,
        ratePerKmOverride: null,
        specialOrigin: "base" as const,
      };
      
      const success = await addTrip(tripData);
      
      if (success) {
        toast.success(t("calendar.importSuccess"));
        setImportOpen(false);
        setSelectedEvent(null);
        navigate("/trips");
      }
    } catch (error) {
      console.error("Error importing event as trip:", error);
      toast.error(t("calendar.importError"));
    } finally {
      setImporting(false);
    }
  };

  const weekdayLabels = useMemo(() => t("calendar.weekdays").split(","), [t]);
  const monthLabel = useMemo(() => {
    const raw = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toLocaleString(locale, { month: "long" });
    return raw ? raw[0].toUpperCase() + raw.slice(1) : raw;
  }, [currentDate, locale]);

  const refreshStatus = async () => {
    setLoadingStatus(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setIsConnected(false);
        return;
      }
      const response = await fetch("/api/google/oauth/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await response.json().catch(() => null);
      setIsConnected(Boolean(data?.connected));
    } catch {
      setIsConnected(false);
    } finally {
      setLoadingStatus(false);
    }
  };

  const disconnectGoogle = async () => {
    setLoadingStatus(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      await fetch("/api/google/oauth/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      try {
        window.localStorage.removeItem(ENABLED_CALENDARS_STORAGE_KEY);
      } catch {
        // ignore
      }

      setIsConnected(false);
      setCalendars([]);
      setEnabledCalendarIds(new Set());
      setEvents([]);
    } finally {
      setLoadingStatus(false);
    }
  };

  const connectGoogle = async () => {
    const token = await getAccessToken();
    if (!token) return;
    const response = await fetch("/api/google/oauth/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scopes: ["calendar"], returnTo: "/calendar" }),
    });
    const data: any = await response.json().catch(() => null);
    if (!response.ok || !data?.authUrl) return;
    window.location.href = data.authUrl;
  };

  const openCreateForDate = (date: Date) => {
    const base = new Date(date);
    base.setHours(9, 0, 0, 0);
    const end = new Date(base.getTime() + 60 * 60 * 1000);

    const defaultCalendarId =
      calendars.find((c) => c.color === "bg-primary")?.id ?? calendars[0]?.id ?? "primary";

    setCreateForm({
      calendarId: defaultCalendarId,
      title: "",
      startLocal: toLocalDateTimeInputValue(base),
      endLocal: toLocalDateTimeInputValue(end),
    });
    setCreateOpen(true);
  };

  const createEvent = async () => {
    const token = await getAccessToken();
    if (!token) return;

    const title = createForm.title.trim();
    if (!title) {
      toast.error("Escribe un título para el evento");
      return;
    }

    const start = new Date(createForm.startLocal);
    const end = new Date(createForm.endLocal);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      toast.error("Revisa la fecha y hora de inicio/fin");
      return;
    }
    if (end.getTime() <= start.getTime()) {
      toast.error("La hora de fin debe ser posterior a la de inicio");
      return;
    }

    setCreateBusy(true);
    try {
      const response = await fetch("/api/google/calendar/create-event", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          calendarId: createForm.calendarId,
          summary: title,
          start: start.toISOString(),
          end: end.toISOString(),
        }),
      });

      const data: any = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(String(data?.error ?? "No se pudo crear el evento"));
        return;
      }

      toast.success("Evento creado");
      setCreateOpen(false);
      await refreshEvents(currentDate);
    } finally {
      setCreateBusy(false);
    }
  };

  const refreshCalendars = async () => {
    const token = await getAccessToken();
    if (!token) return;

    setLoadingCalendars(true);
    setNeedsReconnect(false);
    try {
      const response = await fetch("/api/google/calendar/list-calendars", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await response.json().catch(() => null);
      if (!response.ok || !data) {
        const status = response.status;
        // 403 typically indicates insufficient permissions (scope issue)
        if (status === 403) {
          setNeedsReconnect(true);
        }
        setCalendars([]);
        setEnabledCalendarIds(new Set());
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      const sorted = [...items].sort((a: any, b: any) => {
        const aPrimary = Boolean(a?.primary);
        const bPrimary = Boolean(b?.primary);
        if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
        const aName = String(a?.summary ?? "");
        const bName = String(b?.summary ?? "");
        return aName.localeCompare(bName);
      });

      let nonPrimaryIndex = 0;
      const mapped: CalendarInfo[] = sorted
        .map((c: any) => {
          const id = String(c?.id ?? "").trim();
          if (!id) return null;

          const isPrimary = Boolean(c?.primary);
          const color = isPrimary
            ? "bg-primary"
            : CALENDAR_COLOR_CLASSES[(1 + (nonPrimaryIndex++ % Math.max(1, CALENDAR_COLOR_CLASSES.length - 1)))] ?? "bg-accent";
          return {
            id,
            name: String(c?.summary ?? "Google Calendar") || "Google Calendar",
            color,
          } as CalendarInfo;
        })
        .filter(Boolean) as CalendarInfo[];

      setCalendars(mapped);

      let saved: string[] = [];
      try {
        const raw = window.localStorage.getItem(ENABLED_CALENDARS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) saved = parsed.filter((v) => typeof v === "string");
      } catch {
        // ignore
      }

      const setFromSaved = new Set<string>(saved);
      const nextEnabled = new Set<string>();

      if (setFromSaved.size === 0) {
        // Solo activar el primer calendario por defecto (probablemente el principal)
        if (mapped.length > 0) {
          nextEnabled.add(mapped[0].id);
        }
      } else {
        // Usar la configuración guardada
        for (const c of mapped) {
          if (setFromSaved.has(c.id)) nextEnabled.add(c.id);
        }
      }

      setEnabledCalendarIds(nextEnabled);
      try {
        window.localStorage.setItem(ENABLED_CALENDARS_STORAGE_KEY, JSON.stringify(Array.from(nextEnabled)));
      } catch {
        // ignore
      }
    } finally {
      setLoadingCalendars(false);
    }
  };

  const refreshEvents = async (forDate: Date) => {
    const token = await getAccessToken();
    if (!token) return;

    const monthStart = new Date(forDate.getFullYear(), forDate.getMonth(), 1, 0, 0, 0);
    const monthEnd = new Date(forDate.getFullYear(), forDate.getMonth() + 1, 1, 0, 0, 0);

    // Prevent duplicate calls for the same month
    const refreshKey = `${forDate.getFullYear()}-${forDate.getMonth()}-${Array.from(enabledCalendarIds).sort().join(",")}`;
    if (lastEventsRefreshRef.current === refreshKey) {
      return;
    }
    lastEventsRefreshRef.current = refreshKey;

    setLoadingEvents(true);
    try {
      const enabledIds = Array.from(enabledCalendarIds);
      if (enabledIds.length === 0) {
        setEvents([]);
        return;
      }

      const calendarById = new Map(calendars.map((c) => [c.id, c] as const));

      const results = await Promise.allSettled(
        enabledIds.map(async (calendarId) => {
          const url = new URL("/api/google/calendar/list-events", window.location.origin);
          url.searchParams.set("calendarId", calendarId);
          url.searchParams.set("timeMin", monthStart.toISOString());
          url.searchParams.set("timeMax", monthEnd.toISOString());

          const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data: any = await response.json().catch(() => null);
          if (!response.ok || !data) return { calendarId, items: [] };
          const items = Array.isArray(data.items) ? data.items : [];
          return { calendarId, items };
        })
      );

      const mappedEvents: CalendarEvent[] = [];

      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const calendarId = String(r.value.calendarId ?? "");
        const cal = calendarById.get(calendarId);
        const calendarName = cal?.name ?? "Google Calendar";
        const calendarColor = cal?.color ?? "bg-primary";

        for (const e of r.value.items ?? []) {
          const start = e?.start?.dateTime || e?.start?.date || "";
          const dateKey = toISODateKey(start);
          if (!dateKey) continue;
          mappedEvents.push({
            id: `${calendarId}:${String(e?.id ?? "")}`,
            title: String(e?.summary ?? ""),
            date: dateKey,
            calendar: calendarName,
            color: calendarColor,
            location: String(e?.location ?? ""),
            description: String(e?.description ?? ""),
            start: e?.start,
            end: e?.end,
            htmlLink: String(e?.htmlLink ?? ""),
          });
        }
      }

      setEvents(mappedEvents);
    } finally {
      setLoadingEvents(false);
    }
  };

  const getEventsForDay = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => e.date === dateStr);
  };

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setEvents([]);
      setCalendars([]);
      setEnabledCalendarIds(new Set());
      return;
    }
    refreshCalendars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    if (calendars.length === 0) return;
    
    // Debounce events refresh to avoid rapid successive calls
    if (eventsRefreshTimeoutRef.current) {
      clearTimeout(eventsRefreshTimeoutRef.current);
    }
    
    eventsRefreshTimeoutRef.current = setTimeout(() => {
      refreshEvents(currentDate);
    }, 300);
    
    return () => {
      if (eventsRefreshTimeoutRef.current) {
        clearTimeout(eventsRefreshTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledCalendarIds, currentDate]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ENABLED_CALENDARS_STORAGE_KEY, JSON.stringify(Array.from(enabledCalendarIds)));
    } catch {
      // ignore
    }
  }, [enabledCalendarIds]);

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {t("calendar.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("calendar.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                if (isConnected) {
                  lastEventsRefreshRef.current = ""; // Clear cache to force refresh
                  refreshEvents(currentDate);
                }
              }} 
              disabled={!isConnected || loadingEvents}
            >
              <RefreshCw className="w-4 h-4" />
              {t("calendar.refresh")}
            </Button>
	            {isConnected && calendars.length > 0 && (
	              <Button
	                variant="add"
	                onClick={() => openCreateForDate(new Date())}
	                disabled={loadingCalendars || loadingStatus}
	              >
	                <Plus className="w-4 h-4" />
	                {t("calendar.createEventTitle")}
	              </Button>
	            )}
	            {isConnected && (
	              <Button variant="outline" onClick={disconnectGoogle} disabled={loadingStatus}>
	                {t("calendar.disconnect")}
	              </Button>
	            )}
            {!isConnected && (
              <Button variant="add" onClick={connectGoogle} disabled={loadingStatus}>
                <ExternalLink className="w-4 h-4" />
                {t("calendar.connectGoogle")}
              </Button>
            )}
          </div>
        </div>

	        {needsReconnect && isConnected && (
	          <div className="glass-card p-4 border-warning/30 bg-warning/5 animate-fade-in">
	            <h3 className="font-medium text-sm mb-2">{t("calendar.insufficientPermissionsTitle")}</h3>
	            <p className="text-xs text-muted-foreground mb-3">
	              {t("calendar.insufficientPermissionsBody")}
	            </p>
	            <div className="flex gap-2">
	              <Button size="sm" variant="outline" onClick={disconnectGoogle} disabled={loadingStatus}>
	                {t("calendar.disconnect")}
	              </Button>
	              <Button size="sm" onClick={connectGoogle} disabled={loadingStatus}>
	                {t("calendar.reconnect")}
	              </Button>
	            </div>
	          </div>
	        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("calendar.createEventTitle")}</DialogTitle>
              <DialogDescription className="sr-only">{t("calendar.createEventTitle")}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="event-title">{t("calendar.eventTitleLabel")}</Label>
                <Input
                  id="event-title"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((s) => ({ ...s, title: e.target.value }))}
                  placeholder={t("calendar.eventTitlePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("calendar.calendarLabel")}</Label>
                <Select
                  value={createForm.calendarId}
                  onValueChange={(v) => setCreateForm((s) => ({ ...s, calendarId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("calendar.selectCalendarPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((cal) => (
                      <SelectItem key={cal.id} value={cal.id}>
                        {cal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event-start">{t("calendar.startLabel")}</Label>
                  <Input
                    id="event-start"
                    type="datetime-local"
                    value={createForm.startLocal}
                    onChange={(e) => setCreateForm((s) => ({ ...s, startLocal: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-end">{t("calendar.endLabel")}</Label>
                  <Input
                    id="event-end"
                    type="datetime-local"
                    value={createForm.endLocal}
                    onChange={(e) => setCreateForm((s) => ({ ...s, endLocal: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createBusy}>
                {t("calendar.cancel")}
              </Button>
              <Button onClick={createEvent} disabled={createBusy}>
                {createBusy ? t("calendar.creating") : t("calendar.create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendars sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <div className="glass-card p-4 animate-fade-in animation-delay-100">
              <h2 className="font-semibold mb-3">{t("calendar.calendars")}</h2>
              <div className="space-y-3">
                {loadingCalendars ? (
                  <div className="text-sm text-muted-foreground">{t("calendar.loading")}</div>
                ) : null}
                {calendars.map((cal) => (
                  <div key={cal.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full", cal.color)} />
                      <span className="text-sm">{cal.name}</span>
                    </div>
                    <Switch
                      checked={enabledCalendarIds.has(cal.id)}
                      onCheckedChange={(checked) => {
                        setEnabledCalendarIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(cal.id);
                          else next.delete(cal.id);
                          return next;
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {!isConnected && (
              <div className="glass-card p-4 border-warning/30 bg-warning/5 animate-fade-in animation-delay-200">
                <h3 className="font-medium text-sm mb-2">{t("calendar.notConnected")}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {t("calendar.notConnectedBody")}
                </p>
                <Button size="sm" variant="outline" className="w-full" onClick={connectGoogle} disabled={loadingStatus}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t("calendar.connect")}
                </Button>
              </div>
            )}
          </div>

          {/* Calendar grid */}
          <div className="lg:col-span-3 glass-card p-4 sm:p-6 animate-fade-in animation-delay-100">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setCurrentDate(
                    new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
                  )
                }
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-semibold">
                {monthLabel} {currentDate.getFullYear()}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setCurrentDate(
                    new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
                  )
                }
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekdayLabels.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-muted-foreground py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {emptyDays.map((i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {days.map((day) => {
                const events = getEventsForDay(day);
                const today = new Date();
                const isToday =
                  day === today.getDate() &&
                  currentDate.getMonth() === today.getMonth() &&
                  currentDate.getFullYear() === today.getFullYear();

                const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

                return (
                  <div
                    key={day}
                    className={cn(
                      "aspect-square p-1 rounded-lg border border-transparent hover:border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer group",
                      isToday && "border-primary/50 bg-primary/5"
                    )}
                    onClick={() => {
                      if (!isConnected || calendars.length === 0) return;
                      openCreateForDate(dayDate);
                    }}
                  >
                    <div className="flex flex-col h-full">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isToday && "text-primary"
                        )}
                      >
                        {day}
                      </span>
                      <div className="flex-1 overflow-hidden space-y-0.5 mt-1">
                        {events.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            className={cn(
                              "text-[10px] px-1 py-0.5 rounded truncate text-primary-foreground cursor-pointer hover:opacity-80",
                              event.color
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(event);
                              setImportOpen(true);
                            }}
                          >
                            {event.title}
                          </div>
                        ))}
                        {events.length > 2 && (
                          <div className="text-[10px] text-muted-foreground">
                            {tf("calendar.more", { count: events.length - 2 })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Import Event as Trip Dialog */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("calendar.importEventTitle")}</DialogTitle>
              <DialogDescription>{t("calendar.importEventDescription")}</DialogDescription>
            </DialogHeader>

            {selectedEvent && (
              <div className="space-y-4 py-4">
                {/* Event details */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("calendar.eventTitleLabel")}</Label>
                    <p className="font-medium">{selectedEvent.title}</p>
                  </div>

                  {selectedEvent.location && (
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {t("calendar.eventLocation")}
                      </Label>
                      <p className="text-sm">{selectedEvent.location}</p>
                    </div>
                  )}

                  {selectedEvent.description && (
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {t("calendar.eventDescription")}
                      </Label>
                      <p className="text-sm line-clamp-3">{selectedEvent.description}</p>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t("tripModal.date")}
                    </Label>
                    <p className="text-sm">
                      {new Date(selectedEvent.date + "T00:00:00").toLocaleDateString(locale, {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                {/* Info about how trip will be created */}
                <div className="rounded-lg bg-secondary/50 p-3 space-y-2">
                  <p className="text-sm font-medium">{t("calendar.importWillCreate")}</p>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                    <li>{t("calendar.importClientFromTitle")}</li>
                    <li>{t("calendar.importProjectManual")}</li>
                  </ul>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setImportOpen(false);
                  setSelectedEvent(null);
                }}
                disabled={importing}
              >
                {t("calendar.cancel")}
              </Button>
              {selectedEvent?.htmlLink && (
                <Button
                  variant="outline"
                  onClick={() => window.open(selectedEvent.htmlLink, "_blank")}
                  disabled={importing}
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("calendar.viewInGoogle")}
                </Button>
              )}
              <Button
                onClick={() => selectedEvent && handleImportEventAsTrip(selectedEvent)}
                disabled={importing}
              >
                <Car className="w-4 h-4" />
                {importing ? t("calendar.importing") : t("calendar.importAsTrip")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
