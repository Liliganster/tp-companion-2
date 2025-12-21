import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { SettingsModal } from "@/components/settings/SettingsModal";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-primary/5 via-transparent to-transparent" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-radial from-accent/5 via-transparent to-transparent" />
      </div>

      <div className="relative flex min-h-screen">
        <Sidebar onSettingsClick={() => setSettingsOpen(true)} />
        <MobileHeader onSettingsClick={() => setSettingsOpen(true)} />
        
        <main className="flex-1 lg:pl-0 pt-16 lg:pt-0">
          <div className="p-4 lg:p-8 min-h-screen">
            {children}
          </div>
        </main>
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
