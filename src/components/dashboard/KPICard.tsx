import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  variant?: "default" | "primary" | "accent";
  className?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = "default",
  className,
}: KPICardProps) {
  const isPositive = trend && trend.value >= 0;

  return (
    <div
      className={cn(
        "glass-card p-5 animate-fade-in hover:scale-[1.02] transition-transform duration-300",
        variant === "primary" && "border-primary/30 bg-primary/5",
        variant === "accent" && "border-accent/30 bg-accent/5",
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={cn(
            "p-2.5 rounded-lg",
            variant === "default" && "bg-secondary",
            variant === "primary" && "bg-primary/20",
            variant === "accent" && "bg-accent/20"
          )}
        >
          {icon}
        </div>
        {trend && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              isPositive
                ? "bg-success/20 text-success"
                : "bg-destructive/20 text-destructive"
            )}
          >
            {isPositive ? (
              <ArrowUp className="w-3 h-3" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>

      <div>
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <p
          className={cn(
            "text-2xl font-bold",
            variant === "primary" && "gradient-text"
          )}
        >
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend && (
          <p className="text-xs text-muted-foreground mt-1">{trend.label}</p>
        )}
      </div>
    </div>
  );
}
