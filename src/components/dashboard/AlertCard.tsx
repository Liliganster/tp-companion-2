import { cn } from "@/lib/utils";
import { AlertTriangle, Info, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AlertCardProps {
  type: "warning" | "info" | "error";
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  onDismiss?: () => void;
}

export function AlertCard({ type, title, message, action, onDismiss }: AlertCardProps) {
  const icons = {
    warning: AlertTriangle,
    info: Info,
    error: AlertCircle,
  };

  const Icon = icons[type];

  return (
    <div
      className={cn(
        "glass-card p-4 animate-slide-up",
        type === "warning" && "border-warning/30 bg-warning/5",
        type === "info" && "border-info/30 bg-info/5",
        type === "error" && "border-destructive/30 bg-destructive/5"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "p-2 rounded-lg shrink-0",
            type === "warning" && "bg-warning/20 text-warning",
            type === "info" && "bg-info/20 text-info",
            type === "error" && "bg-destructive/20 text-destructive"
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
          {action && (
            <Button
              variant="link"
              size="sm"
              className="px-0 h-auto mt-1"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onDismiss}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
