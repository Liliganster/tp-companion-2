import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderKanban, FileText, Calendar, Settings, Sparkles, Crown, LogOut, Menu, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { getProfileInitial, useUserProfile } from "@/contexts/UserProfileContext";
import { useI18n } from "@/hooks/use-i18n";
import { useAuth } from "@/contexts/AuthContext";
interface MobileHeaderProps {
  onSettingsClick: () => void;
}
export function MobileHeader({
  onSettingsClick
}: MobileHeaderProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
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
  return <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 glass border-b border-border/50">
      <div className="flex items-center justify-between h-full px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/favicon-32x32.png" alt="Fahrtenbuch Pro" className="w-8 h-8" />
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
                <span className="font-semibold">{t("nav.menu")}</span>
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

              {/* Bottom actions */}
              <div className="px-3 py-4 border-t border-border/50 space-y-3">
                <button onClick={() => {
                setOpen(false);
                onSettingsClick();
              }} className="nav-item w-full">
                  <Settings className="w-5 h-5" />
                  <span>{t("nav.settings")}</span>
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                  className="nav-item w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="w-5 h-5" />
                  <span>{t("nav.logout")}</span>
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
