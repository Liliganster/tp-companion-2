import { useState } from "react";
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

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  calendar: string;
  color: string;
}

const mockEvents: CalendarEvent[] = [
  { id: "1", title: "Film Shoot - Berlin", date: "2024-01-15", calendar: "Work", color: "bg-primary" },
  { id: "2", title: "Client Meeting", date: "2024-01-16", calendar: "Work", color: "bg-primary" },
  { id: "3", title: "Location Scout", date: "2024-01-18", calendar: "Film XY", color: "bg-accent" },
  { id: "4", title: "Equipment Pickup", date: "2024-01-20", calendar: "Film XY", color: "bg-accent" },
  { id: "5", title: "Review Meeting", date: "2024-01-22", calendar: "Work", color: "bg-primary" },
];

const calendars = [
  { id: "1", name: "Work", color: "bg-primary", enabled: true },
  { id: "2", name: "Film XY", color: "bg-accent", enabled: true },
  { id: "3", name: "Personal", color: "bg-success", enabled: false },
];

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2024, 0, 1));
  const [isConnected] = useState(false);

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

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getEventsForDay = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return mockEvents.filter((e) => e.date === dateStr);
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Calendar
            </h1>
            <p className="text-muted-foreground mt-1">
              Sync events from Google Calendar
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            {!isConnected && (
              <Button variant="add">
                <ExternalLink className="w-4 h-4" />
                Connect Google
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendars sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <div className="glass-card p-4 animate-fade-in animation-delay-100">
              <h2 className="font-semibold mb-3">Calendars</h2>
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
                <h3 className="font-medium text-sm mb-2">Not Connected</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Connect your Google Calendar to sync events and create trips from calendar entries.
                </p>
                <Button size="sm" variant="outline" className="w-full">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Connect
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
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
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
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
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
                const isToday =
                  day === 15 &&
                  currentDate.getMonth() === 0 &&
                  currentDate.getFullYear() === 2024;

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
                            +{events.length - 2} more
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
