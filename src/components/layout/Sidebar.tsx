import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderKanban, FileText, Calendar, Settings, Sparkles, Crown, LogOut, ChevronLeft, ChevronRight, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import { getProfileInitial, useUserProfile } from "@/contexts/UserProfileContext";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/contexts/PlanContext";
interface SidebarProps {
  onSettingsClick: () => void;
}
export function Sidebar({
  onSettingsClick
}: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { profile } = useUserProfile();
  const { signOut } = useAuth();
  const { t } = useI18n();
  const { planTier } = usePlan();
  const profileInitial = getProfileInitial(profile.fullName);
  const logoSrc = "/Pro%20(23%20x%204.9%20cm)%20(2).png";
  const collapsedLogoSrc = "/Pro%20(1).png";
  const navigation = [{
    name: t("nav.dashboard"),
    href: "/",
    icon: LayoutDashboard
  }, {
    name: t("nav.trips"),
    href: "/trips",
    icon: Route
  }, {
    name: t("nav.projects"),
    href: "/projects",
    icon: FolderKanban
  }, {
    name: t("nav.reports"),
    href: "/reports",
    icon: FileText
  }, {
    name: t("nav.calendar"),
    href: "/calendar",
    icon: Calendar
  }, {
    name: t("nav.advanced"),
    href: "/advanced",
    icon: Sparkles
  }];
  return <aside
      className={cn(
        "hidden lg:flex flex-col sticky top-0 h-screen shrink-0 glass border-r border-border/50 transition-[width] will-change-[width] relative",
        collapsed
          ? "w-20 duration-500 ease-in-out"
          : "w-64 duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
      )}
    >
      {/* Expand/Collapse Edge Indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 group"
          >
            {/* Línea vertical azul (estado normal) */}
            <div className="w-1 h-8 bg-white/25 rounded-full group-hover:opacity-0 transition-opacity" />
            {/* Flecha (estado hover) */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-5 h-5 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shadow-sm">
                {collapsed ? (
                  <ChevronRight className="w-3 h-3 text-foreground" />
                ) : (
                  <ChevronLeft className="w-3 h-3 text-foreground" />
                )}
              </div>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {collapsed ? t("nav.expand") : t("nav.collapse")}
        </TooltipContent>
      </Tooltip>

      {/* Logo */}
      <div className="flex items-center justify-center h-16 px-4 border-b border-border/50">
        <Link to="/" className="flex items-center justify-center w-full" aria-label="Home">
          <img
            src={collapsed ? collapsedLogoSrc : logoSrc}
            alt="Logo"
            className={cn(
              "object-contain",
              collapsed ? "h-10 w-10" : "h-12 w-auto max-w-full"
            )}
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map(item => {
        const isActive = location.pathname === item.href;
        return <Link key={item.name} to={item.href} className={cn("nav-item", isActive && "nav-item-active", collapsed && "justify-center px-2")} title={collapsed ? item.name : undefined}>
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>;
      })}
      </nav>

      {/* Plans (not navigation, not bottom actions) */}
      <div className="px-3 pb-4">
        <Link
          to="/plans"
          className={cn(
            "block w-full rounded-lg p-3 transition-colors",
            "border border-violet-500/60 bg-violet-500/10 hover:bg-violet-500/20",
            collapsed && "p-2"
          )}
          title={collapsed ? t("nav.plans") : undefined}
        >
          <div className={cn("flex w-full items-center gap-2", collapsed && "justify-center gap-0")}>
            <Crown className="w-5 h-5 shrink-0 text-yellow-400" />
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">
                  {planTier === "pro" ? "Pro Plan" : t("plans.sidebar.free")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {planTier === "pro" ? t("plans.sidebar.manage") : t("plans.sidebar.upgrade")}
                </span>
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-border/50 space-y-3">
        <button onClick={onSettingsClick} className={cn("nav-item w-full", collapsed && "justify-center px-2")} title={collapsed ? t("nav.settings") : undefined}>
          <Settings className="w-5 h-5 shrink-0" />
          {!collapsed && <span>{t("nav.settings")}</span>}
        </button>
        <button onClick={() => signOut()} className={cn("nav-item w-full text-red-500 hover:text-red-600 hover:bg-red-500/10", collapsed && "justify-center px-2")} title={collapsed ? t("nav.logout") : undefined}>
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>{t("nav.logout")}</span>}
        </button>

        {/* User Profile */}
        <div className={cn("flex items-center gap-3 pt-3 border-t border-border/50", collapsed && "justify-center")}>
          <div className="w-9 h-9 rounded-full bg-[#129446] flex items-center justify-center shrink-0">
            <span className="text-sm font-medium text-white">{profileInitial}</span>
          </div>
          {!collapsed && <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-foreground">{profile.fullName}</p>
              <p className="text-xs text-muted-foreground">{profile.licensePlate}</p>
            </div>}
        </div>
      </div>
    </aside>;
}
