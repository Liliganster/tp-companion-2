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
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/5 to-black/25" />

        {backgroundVariant === "plans" && (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-950/70 via-zinc-950/60 to-zinc-900/20" />
            <div className="absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-white/5 blur-3xl" />
            <div className="absolute -bottom-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
            <div className="absolute -bottom-40 left-[-10%] h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
          </>
        )}
      </div>

      <div className="relative z-10 flex min-h-screen lg:h-screen">
        <Sidebar onSettingsClick={() => setSettingsOpen(true)} />
        <MobileHeader onSettingsClick={() => setSettingsOpen(true)} />
        
        <main className="flex-1 lg:pl-0 pt-16 lg:pt-0 overflow-x-hidden lg:h-screen lg:overflow-hidden">
          <div className="p-4 lg:p-8 min-h-screen lg:min-h-0 lg:h-full lg:overflow-y-auto">
            {children}
          </div>
        </main>
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
