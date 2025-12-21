import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderKanban, FileText, Calendar, Settings, Sparkles, Crown, LogOut, Menu, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import appIcon from "@/assets/app-icon.png";
import { getProfileInitial, useUserProfile } from "@/contexts/UserProfileContext";
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
interface MobileHeaderProps {
  onSettingsClick: () => void;
}
export function MobileHeader({
  onSettingsClick
}: MobileHeaderProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { profile } = useUserProfile();
  const profileInitial = getProfileInitial(profile.fullName);
  return <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 glass border-b border-border/50">
      <div className="flex items-center justify-between h-full px-4">
        <Link to="/" className="flex items-center gap-2">
          
          <span className="font-semibold text-lg text-foreground">Fahrtenbuch Pro</span>
        </Link>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 glass border-l border-border/50 p-0 [&>button]:hidden">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center h-16 px-4 border-b border-border/50">
                <span className="font-semibold">Menu</span>
              </div>

              {/* Navigation */}
              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {navigation.map(item => {
                const isActive = location.pathname === item.href;
                return <Link key={item.name} to={item.href} onClick={() => setOpen(false)} className={cn("nav-item", isActive && "nav-item-active")}>
                      <item.icon className="w-5 h-5" />
                      <span>{item.name}</span>
                    </Link>;
              })}
              </nav>

              {/* Plan badge */}
              <div className="px-3 py-4">
                <Link to="/plans" onClick={() => setOpen(false)} className="flex items-center gap-3 p-3 rounded-md bg-violet-500/10 border border-violet-500/30 hover:border-violet-500/50 transition-colors">
                  <Crown className="w-5 h-5 text-violet-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Free Plan</p>
                    <p className="text-xs text-muted-foreground">Upgrade to Pro</p>
                  </div>
                </Link>
              </div>

              {/* Bottom actions */}
              <div className="px-3 py-4 border-t border-border/50 space-y-3">
                <button onClick={() => {
                setOpen(false);
                onSettingsClick();
              }} className="nav-item w-full">
                  <Settings className="w-5 h-5" />
                  <span>Settings</span>
                </button>
                <button className="nav-item w-full text-destructive hover:text-destructive hover:bg-destructive/10">
                  <LogOut className="w-5 h-5" />
                  <span>Cerrar sesión</span>
                </button>

                {/* User Profile */}
                <div className="flex items-center gap-3 pt-3 border-t border-border/50">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-sm font-medium text-muted-foreground">{profileInitial}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{profile.fullName}</p>
                    <p className="text-xs text-muted-foreground">{profile.licensePlate}</p>
                  </div>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>;
}
