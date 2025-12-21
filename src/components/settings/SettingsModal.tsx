import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  User,
  Sparkles,
  Palette,
  Languages,
  Newspaper,
  HelpCircle,
  Trash2,
  Save,
  Sun,
  Moon,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useI18n } from "@/hooks/use-i18n";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState("profile");
  const { t } = useI18n();

  const { profile, saveProfile } = useUserProfile();

  // Draft form state for profile
  const [profileData, setProfileData] = useState(profile);

  useEffect(() => {
    if (!open) return;
    setProfileData(profile);
  }, [open, profile]);

  // Personalization state
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [uiOpacity, setUiOpacity] = useState([0]);
  const [uiBlur, setUiBlur] = useState([16]);
  const [bgBlur, setBgBlur] = useState([0]);

  const navItems = [
    { id: "profile", label: t("settings.tabProfile"), icon: User },
    { id: "apis", label: t("settings.tabApis"), icon: Sparkles },
    { id: "personalization", label: t("settings.tabPersonalization"), icon: Palette },
    { id: "language", label: t("settings.tabLanguage"), icon: Languages },
    { id: "news", label: t("settings.tabNews"), icon: Newspaper },
    { id: "help", label: t("settings.tabHelp"), icon: HelpCircle },
  ];

  const handleSave = () => {
    saveProfile(profileData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[800px] h-[600px] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-xl font-semibold">{t("settings.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <nav className="w-56 shrink-0 border-r border-border hidden sm:block">
            <ScrollArea className="h-full py-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors",
                    activeTab === item.id
                      ? "bg-primary/10 text-primary border-r-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              ))}
            </ScrollArea>
          </nav>

          {/* Mobile Navigation */}
          <div className="sm:hidden border-b border-border px-4 py-2 overflow-x-auto flex gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs rounded-lg whitespace-nowrap transition-colors",
                  activeTab === item.id
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-secondary/50"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              {activeTab === "profile" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-medium">{t("settings.profileSectionTitle")}</h2>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">{t("settings.fullName")}</Label>
                      <Input
                        id="fullName"
                        value={profileData.fullName}
                        onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vatId">{t("settings.vatId")}</Label>
                      <Input
                        id="vatId"
                        value={profileData.vatId}
                        onChange={(e) => setProfileData({ ...profileData, vatId: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="licensePlate">{t("settings.licensePlate")}</Label>
                      <Input
                        id="licensePlate"
                        value={profileData.licensePlate}
                        onChange={(e) => setProfileData({ ...profileData, licensePlate: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ratePerKm">{t("settings.ratePerKm")}</Label>
                      <Input
                        id="ratePerKm"
                        value={profileData.ratePerKm}
                        onChange={(e) => setProfileData({ ...profileData, ratePerKm: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="passengerSurcharge">{t("settings.passengerSurcharge")}</Label>
                    <Input
                      id="passengerSurcharge"
                      value={profileData.passengerSurcharge}
                      onChange={(e) => setProfileData({ ...profileData, passengerSurcharge: e.target.value })}
                      className="bg-secondary/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="baseAddress">{t("settings.baseAddress")}</Label>
                    <Input
                      id="baseAddress"
                      value={profileData.baseAddress}
                      onChange={(e) => setProfileData({ ...profileData, baseAddress: e.target.value })}
                      className="bg-secondary/50"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t("settings.city")}</Label>
                      <Input
                        id="city"
                        value={profileData.city}
                        onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">{t("settings.country")}</Label>
                      <Input
                        id="country"
                        value={profileData.country}
                        onChange={(e) => setProfileData({ ...profileData, country: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>

                  {/* Delete Account */}
                  <div className="mt-8 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
                    <div className="flex items-start gap-3">
                      <Trash2 className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-medium text-destructive">{t("settings.deleteAccountTitle")}</h3>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">
                          {t("settings.deleteAccountBody")}
                        </p>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t("settings.deleteAccountButton")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}


              {activeTab === "apis" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-medium">{t("settings.tabApis")}</h2>
                  <div className="glass-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Gemini AI (Default)</h3>
                        <p className="text-sm text-muted-foreground">{t("settings.apisGeminiBody")}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-success">
                        <div className="w-2 h-2 rounded-full bg-success" />
                        {t("settings.apisActive")}
                      </div>
                    </div>
                  </div>

                  <div className="glass-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{t("settings.apisOpenRouterTitle")}</h3>
                        <p className="text-sm text-muted-foreground">{t("settings.apisOpenRouterBody")}</p>
                      </div>
                      <Switch />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="openrouter">{t("settings.apisApiKey")}</Label>
                      <Input id="openrouter" type="password" placeholder="sk-..." className="bg-secondary/50" />
                    </div>
                  </div>

                  <div className="glass-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Google Calendar</h3>
                        <p className="text-sm text-muted-foreground">{t("settings.apisGoogleCalendarBody")}</p>
                      </div>
                      <Button variant="outline" size="sm">{t("settings.apisConnect")}</Button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "personalization" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-medium">{t("settings.appearanceTitle")}</h2>
                  
                  {/* Theme */}
                  <div className="space-y-3">
                    <Label>{t("settings.theme")}</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setTheme("light")}
                        className={cn(
                          "p-4 rounded-lg border transition-colors text-left flex items-start gap-3",
                          theme === "light"
                            ? "bg-primary/10 border-primary/50"
                            : "bg-secondary/50 border-border/50 hover:border-primary/30"
                        )}
                      >
                        <Sun className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-sm">
                            {t("settings.themeLight")} {theme === "light" && `(${t("settings.current")})`}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">{t("settings.themeLightDesc")}</p>
                        </div>
                      </button>
                      <button
                        onClick={() => setTheme("dark")}
                        className={cn(
                          "p-4 rounded-lg border transition-colors text-left flex items-start gap-3",
                          theme === "dark"
                            ? "bg-primary/10 border-primary/50"
                            : "bg-secondary/50 border-border/50 hover:border-primary/30"
                        )}
                      >
                        <Moon className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-sm">
                            {t("settings.themeDark")} {theme === "dark" && `(${t("settings.current")})`}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">{t("settings.themeDarkDesc")}</p>
                        </div>
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("settings.themeHint")}</p>
                  </div>

                  {/* Background Image */}
                  <div className="space-y-3">
                    <Label>{t("settings.backgroundImage")}</Label>
                    <Button variant="upload" className="gap-2">
                      <Upload className="w-4 h-4" />
                      {t("settings.uploadFromComputer")}
                    </Button>
                  </div>

                  {/* Preset Backgrounds */}
                  <div className="space-y-3">
                    <Label>{t("settings.presetBackgrounds")}</Label>
                    <div className="flex gap-3">
                      <button className="w-24 h-16 rounded-lg bg-gradient-to-br from-gray-400 to-gray-600 border-2 border-transparent hover:border-primary/50 transition-colors overflow-hidden">
                        <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1501691223387-dd0500403074?w=200')] bg-cover bg-center" />
                      </button>
                      <button className="w-24 h-16 rounded-lg bg-gradient-to-br from-gray-400 to-gray-600 border-2 border-transparent hover:border-primary/50 transition-colors overflow-hidden">
                        <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200')] bg-cover bg-center" />
                      </button>
                      <button className="w-24 h-16 rounded-lg bg-gradient-to-br from-purple-600 to-purple-900 border-2 border-transparent hover:border-primary/50 transition-colors overflow-hidden">
                        <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=200')] bg-cover bg-center" />
                      </button>
                    </div>
                  </div>

                  {/* UI Opacity */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>{t("settings.uiOpacity")}</Label>
                      <span className="text-sm text-muted-foreground">{uiOpacity[0]}%</span>
                    </div>
                    <Slider
                      value={uiOpacity}
                      onValueChange={setUiOpacity}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* UI Blur */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>{t("settings.uiBlur")}</Label>
                      <span className="text-sm text-muted-foreground">{uiBlur[0]}px</span>
                    </div>
                    <Slider
                      value={uiBlur}
                      onValueChange={setUiBlur}
                      max={50}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Background Blur */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>{t("settings.backgroundBlur")}</Label>
                      <span className="text-sm text-muted-foreground">{bgBlur[0]}px</span>
                    </div>
                    <Slider
                      value={bgBlur}
                      onValueChange={setBgBlur}
                      max={50}
                      step={1}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              {activeTab === "language" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-medium">{t("settings.tabLanguage")}</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { code: "de", name: "Deutsch" },
                      { code: "en", name: "English" },
                      { code: "es", name: "Español" },
                    ].map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setProfileData({ ...profileData, language: lang.code as typeof profileData.language })}
                        className={cn(
                          "p-3 rounded-lg border transition-colors text-left",
                          lang.code === profileData.language
                            ? "bg-primary/10 border-primary/50 text-primary"
                            : "bg-secondary/50 border-border/50 hover:border-primary/50"
                        )}
                      >
                        <span className="text-sm font-medium">{lang.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "news" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-medium">{t("settings.tabNews")}</h2>
                  <div className="glass-card p-4 space-y-2">
                    <h3 className="font-medium">{t("settings.appVersionTitle")}</h3>
                    <p className="text-sm text-muted-foreground">Fahrtenbuch Pro v1.0.0</p>
                    <Button variant="outline" size="sm">{t("settings.checkUpdates")}</Button>
                  </div>

                  <div className="glass-card p-4 space-y-2">
                    <h3 className="font-medium">Changelog</h3>
                    <p className="text-sm text-muted-foreground">{t("settings.changelogBody")}</p>
                    <Button variant="outline" size="sm">{t("settings.viewChangelog")}</Button>
                  </div>
                </div>
              )}

              {activeTab === "help" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-medium">{t("settings.helpTitle")}</h2>
                  <div className="glass-card p-4 space-y-2">
                    <h3 className="font-medium">{t("settings.docsTitle")}</h3>
                    <p className="text-sm text-muted-foreground">{t("settings.docsBody")}</p>
                    <Button variant="outline" size="sm">{t("settings.viewDocs")}</Button>
                  </div>

                  <div className="glass-card p-4 space-y-2">
                    <h3 className="font-medium">{t("settings.supportTitle")}</h3>
                    <p className="text-sm text-muted-foreground">{t("settings.supportBody")}</p>
                    <Button variant="outline" size="sm">{t("settings.contactSupport")}</Button>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("settings.build")} 1fded46 @ 2025-12-20T20:43:47.046Z
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("settings.cancel")}
            </Button>
            <Button variant="save" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              {t("settings.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
