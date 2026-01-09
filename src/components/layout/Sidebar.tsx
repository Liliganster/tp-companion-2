import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderKanban, FileText, Calendar, Settings, Sparkles, Crown, LogOut, ChevronLeft, ChevronRight, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import { getProfileInitial, useUserProfile } from "@/contexts/UserProfileContext";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/contexts/AuthContext";
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
  const profileInitial = getProfileInitial(profile.fullName);
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
  return <aside className={cn("hidden lg:flex flex-col sticky top-0 h-screen shrink-0 glass border-r border-border/50 transition-all duration-300 relative", collapsed ? "w-20" : "w-64")}>
      {/* Expand/Collapse Edge Indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 group"
          >
            {/* Línea vertical azul (estado normal) */}
            <div className="w-1 h-8 bg-blue-500 rounded-full group-hover:opacity-0 transition-opacity" />
            {/* Flecha (estado hover) */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow-sm">
                {collapsed ? (
                  <ChevronRight className="w-3 h-3 text-primary-foreground" />
                ) : (
                  <ChevronLeft className="w-3 h-3 text-primary-foreground" />
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
        {!collapsed && <Link to="/" className="flex items-center gap-2">
            <img src="/favicon-32x32.png" alt="Fahrtenbuch Pro" className="w-8 h-8" />
            <span className="font-semibold text-lg text-foreground">Fahrtenbuch Pro</span>
          </Link>}
        {collapsed && <Link to="/" className="flex items-center justify-center w-full">
            <img src="/favicon-32x32.png" alt="Fahrtenbuch Pro" className="w-8 h-8" />
          </Link>}
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

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-border/50 space-y-3">
        <button onClick={onSettingsClick} className={cn("nav-item w-full", collapsed && "justify-center px-2")} title={collapsed ? t("nav.settings") : undefined}>
          <Settings className="w-5 h-5 shrink-0" />
          {!collapsed && <span>{t("nav.settings")}</span>}
        </button>
        <button onClick={() => signOut()} className={cn("nav-item w-full text-destructive hover:text-destructive hover:bg-destructive/10", collapsed && "justify-center px-2")} title={collapsed ? t("nav.logout") : undefined}>
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>{t("nav.logout")}</span>}
        </button>

        {/* User Profile */}
        <div className={cn("flex items-center gap-3 pt-3 border-t border-border/50", collapsed && "justify-center")}>
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-sm font-medium text-muted-foreground">{profileInitial}</span>
          </div>
          {!collapsed && <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-white">{profile.fullName}</p>
              <p className="text-xs text-muted-foreground">{profile.licensePlate}</p>
            </div>}
        </div>
      </div>
    </aside>;
}
