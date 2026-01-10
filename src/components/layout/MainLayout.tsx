import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { SettingsModal } from "@/components/settings/SettingsModal";

interface MainLayoutProps {
  children: ReactNode;
  backgroundVariant?: "default" | "plans";
}

export function MainLayout({ children, backgroundVariant = "default" }: MainLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-background">
      {/* Background gradient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none app-background-effects z-0">
        <div className="absolute inset-0 app-background-image" />
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-primary/5 via-transparent to-transparent" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-radial from-accent/5 via-transparent to-transparent" />

        {backgroundVariant === "plans" && (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950/60 via-zinc-950/60 to-purple-950/35" />
            <div className="absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-yellow-500/5 blur-3xl" />
            <div className="absolute -bottom-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute -bottom-40 left-[-10%] h-[520px] w-[520px] rounded-full bg-purple-500/10 blur-3xl" />
          </>
        )}
      </div>

      <div className="relative z-10 flex min-h-screen">
        <Sidebar onSettingsClick={() => setSettingsOpen(true)} />
        <MobileHeader onSettingsClick={() => setSettingsOpen(true)} />
        
        <main className="flex-1 lg:pl-0 pt-16 lg:pt-0 overflow-x-hidden">
          <div className="p-4 lg:p-8 min-h-screen">
            {children}
          </div>
        </main>
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
