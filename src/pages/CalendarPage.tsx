import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Calendar,
  RefreshCw,
  ExternalLink,
  Check,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/contexts/AuthContext";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  calendar: string;
  color: string;
}

const calendars = [{ id: "primary", name: "Google Calendar", color: "bg-primary", enabled: true }];

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
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [isConnected, setIsConnected] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

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

  const refreshEvents = async (forDate: Date) => {
    const token = await getAccessToken();
    if (!token) return;

    const monthStart = new Date(forDate.getFullYear(), forDate.getMonth(), 1, 0, 0, 0);
    const monthEnd = new Date(forDate.getFullYear(), forDate.getMonth() + 1, 1, 0, 0, 0);

    setLoadingEvents(true);
    try {
      const url = new URL("/api/google/calendar/list-events", window.location.origin);
      url.searchParams.set("timeMin", monthStart.toISOString());
      url.searchParams.set("timeMax", monthEnd.toISOString());

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setEvents([]);
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      const mapped: CalendarEvent[] = items
        .map((e: any) => {
          const start = e?.start?.dateTime || e?.start?.date || "";
          const dateKey = toISODateKey(start);
          if (!dateKey) return null;
          return {
            id: String(e?.id ?? ""),
            title: String(e?.summary ?? ""),
            date: dateKey,
            calendar: "Google Calendar",
            color: "bg-primary",
          } as CalendarEvent;
        })
        .filter(Boolean) as CalendarEvent[];

      setEvents(mapped);
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
      return;
    }
    refreshEvents(currentDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, currentDate]);

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
            <Button variant="outline" onClick={() => isConnected && refreshEvents(currentDate)} disabled={!isConnected || loadingEvents}>
              <RefreshCw className="w-4 h-4" />
              {t("calendar.refresh")}
            </Button>
            {!isConnected && (
              <Button variant="add" onClick={connectGoogle} disabled={loadingStatus}>
                <ExternalLink className="w-4 h-4" />
                {t("calendar.connectGoogle")}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendars sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <div className="glass-card p-4 animate-fade-in animation-delay-100">
              <h2 className="font-semibold mb-3">{t("calendar.calendars")}</h2>
              <div className="space-y-3">
                {calendars.map((cal) => (
                  <div key={cal.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full", cal.color)} />
                      <span className="text-sm">{cal.name}</span>
                    </div>
                    <Switch defaultChecked={cal.enabled} />
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

                return (
                  <div
                    key={day}
                    className={cn(
                      "aspect-square p-1 rounded-lg border border-transparent hover:border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer group",
                      isToday && "border-primary/50 bg-primary/5"
                    )}
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
                              "text-[10px] px-1 py-0.5 rounded truncate text-primary-foreground",
                              event.color
                            )}
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
      </div>
    </MainLayout>
  );
}
