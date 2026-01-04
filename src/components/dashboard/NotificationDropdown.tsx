import { Bell, AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTrips } from "@/contexts/TripsContext";
import { computeTripWarnings } from "@/lib/trip-warnings";
import { useI18n } from "@/hooks/use-i18n";
interface Notification {
  id: string;
  type: "warning";
  title: string;
  message: string;
  tripId: string;
}
export function NotificationDropdown() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { trips } = useTrips();

  const notifications = useMemo<Notification[]>(() => {
    return computeTripWarnings(trips, t).toNotifications().map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      tripId: n.tripId,
    }));
  }, [trips, t]);
  return <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground border-none" />
          {notifications.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
              {notifications.length}
            </span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 bg-card border-border">
        <div className="p-3 border-b border-border">
          <h3 className="font-semibold text-sm">{t("dashboard.warnings")}</h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? <div className="p-4 text-center text-muted-foreground text-sm">
              {t("dashboard.noWarnings")}
            </div> : notifications.map(notification => {
          return <div key={notification.id} className={cn("p-3 border-b border-border last:border-b-0 bg-warning/5")}>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-md shrink-0 bg-warning/20 text-warning">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs">{notification.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        className="px-0 h-auto text-xs mt-1"
                        onClick={() => navigate("/trips")}
                      >
                        {t("dashboard.viewTrips")}
                      </Button>
                    </div>
                  </div>
                </div>;
        })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>;
}
