import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderKanban, FileText, Calendar, Settings, Sparkles, Crown, LogOut, ChevronLeft, ChevronRight, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import appIcon from "@/assets/app-icon.png";
const navigation = [{
  name: "Dashboard",
  href: "/",
  icon: LayoutDashboard
}, {
  name: "Trips",
  href: "/trips",
  icon: Route
}, {
  name: "Projects",
  href: "/projects",
  icon: FolderKanban
}, {
  name: "Reports",
  href: "/reports",
  icon: FileText
}, {
  name: "Calendar",
  href: "/calendar",
  icon: Calendar
}, {
  name: "Advanced",
  href: "/advanced",
  icon: Sparkles
}];
interface SidebarProps {
  onSettingsClick: () => void;
}
export function Sidebar({
  onSettingsClick
}: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  return <aside className={cn("hidden lg:flex flex-col h-screen glass border-r border-border/50 transition-all duration-300", collapsed ? "w-20" : "w-64")}>
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border/50">
        {!collapsed && <Link to="/" className="flex items-center gap-2">
            
            <span className="font-semibold text-lg text-foreground">Fahrtenbuch Pro</span>
          </Link>}
        {collapsed && <img src={appIcon} alt="Fahrtenbuch Pro" className="w-8 h-8 rounded-md mx-auto" />}
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className={cn("h-8 w-8", collapsed && "absolute right-2 top-4")}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
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

      {/* Plan badge */}
      {!collapsed && <div className="px-3 py-4">
          <Link to="/plans" className="flex items-center gap-3 p-3 rounded-md bg-violet-500/10 border border-violet-500/30 hover:border-violet-500/50 transition-colors">
            <Crown className="w-5 h-5 text-violet-500" />
            <div className="flex-1">
              <p className="text-sm font-medium">Free Plan</p>
              <p className="text-xs text-muted-foreground">Upgrade to Pro</p>
            </div>
          </Link>
        </div>}

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-border/50 space-y-3">
        <button onClick={onSettingsClick} className={cn("nav-item w-full", collapsed && "justify-center px-2")} title={collapsed ? "Settings" : undefined}>
          <Settings className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
        <button className={cn("nav-item w-full text-destructive hover:text-destructive hover:bg-destructive/10", collapsed && "justify-center px-2")} title={collapsed ? "Logout" : undefined}>
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>

        {/* User Profile */}
        <div className={cn("flex items-center gap-3 pt-3 border-t border-border/50", collapsed && "justify-center")}>
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-sm font-medium text-muted-foreground">L</span>
          </div>
          {!collapsed && <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-white">lilianmartinez357</p>
              <p className="text-xs text-muted-foreground">W-123AB</p>
            </div>}
        </div>
      </div>
    </aside>;
}