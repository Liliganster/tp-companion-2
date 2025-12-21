import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  iconWrapperClassName?: string;
  hideTitle?: boolean;
  leading?: ReactNode;
  headerRight?: ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  action?: ReactNode;
  valueClassName?: string;
  valueGradient?: boolean;
  trendLabelPlacement?: "below" | "pill";
  variant?: "default" | "primary" | "accent";
  className?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  icon,
  iconWrapperClassName,
  hideTitle = false,
  leading,
  headerRight,
  trend,
  action,
  valueClassName,
  valueGradient,
  trendLabelPlacement = "below",
  variant = "default",
  className,
}: KPICardProps) {
  const isPositive = trend && trend.value >= 0;
  const useGradientValue = valueGradient ?? variant === "primary";

  return (
    <div
      className={cn(
        "relative glass-card p-5 animate-fade-in hover:scale-[1.02] transition-transform duration-300",
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
            variant === "accent" && "bg-accent/20",
            iconWrapperClassName
          )}
        >
          {icon}
        </div>
        {headerRight ? (
          headerRight
        ) : trend ? (
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full",
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
            <span>{Math.abs(trend.value)}%</span>
            {trendLabelPlacement === "pill" && (
              <span className="text-muted-foreground">{trend.label}</span>
            )}
          </div>
        ) : null}
      </div>

      <div>
        {!hideTitle && <p className="text-sm text-muted-foreground mb-1">{title}</p>}
        {leading}
        <p
          className={cn(
            "text-2xl font-bold",
            useGradientValue && "gradient-text",
            valueClassName
          )}
        >
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend && trendLabelPlacement === "below" && (
          <p className="text-xs text-muted-foreground mt-1">{trend.label}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
