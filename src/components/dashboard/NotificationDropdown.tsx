import { Bell, AlertTriangle, Info, AlertCircle, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
interface Notification {
  id: string;
  type: "warning" | "info" | "error";
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}
const initialNotifications: Notification[] = [{
  id: "1",
  type: "warning",
  title: "Unusual Distance",
  message: "Trip on Jan 12 shows 850km - this seems unusually long. Please verify.",
  action: {
    label: "Review Trip",
    onClick: () => {}
  }
}, {
  id: "2",
  type: "info",
  title: "Missing Purpose",
  message: "3 trips from last week are missing trip purposes.",
  action: {
    label: "Add Purposes",
    onClick: () => {}
  }
}];
export function NotificationDropdown() {
  const [notifications, setNotifications] = useState(initialNotifications);
  const icons = {
    warning: AlertTriangle,
    info: Info,
    error: AlertCircle
  };
  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };
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
          <h3 className="font-semibold text-sm">Notifications</h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? <div className="p-4 text-center text-muted-foreground text-sm">
              No notifications
            </div> : notifications.map(notification => {
          const Icon = icons[notification.type];
          return <div key={notification.id} className={cn("p-3 border-b border-border last:border-b-0", notification.type === "warning" && "bg-warning/5", notification.type === "info" && "bg-info/5", notification.type === "error" && "bg-destructive/5")}>
                  <div className="flex items-start gap-3">
                    <div className={cn("p-1.5 rounded-md shrink-0", notification.type === "warning" && "bg-warning/20 text-warning", notification.type === "info" && "bg-info/20 text-info", notification.type === "error" && "bg-destructive/20 text-destructive")}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs">{notification.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      {notification.action && <Button variant="link" size="sm" className="px-0 h-auto text-xs mt-1" onClick={notification.action.onClick}>
                          {notification.action.label}
                        </Button>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => dismissNotification(notification.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>;
        })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>;
}