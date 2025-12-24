import { useEffect, useMemo, useRef, useState } from "react";
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
import { useAppearance } from "@/contexts/AppearanceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState("profile");
  const { t } = useI18n();
  const { toast } = useToast();

  const { profile, saveProfile } = useUserProfile();
  const { appearance, saveAppearance, previewAppearance, resetPreview } = useAppearance();
  const { getAccessToken } = useAuth();

  // Draft form state for profile
  const [profileData, setProfileData] = useState(profile);

  useEffect(() => {
    if (!open) return;
    setProfileData(profile);
  }, [open, profile]);

  // Personalization state
  const [theme, setTheme] = useState<"light" | "dark">(appearance.theme);
  const [uiOpacity, setUiOpacity] = useState([appearance.uiOpacity]);
  const [uiBlur, setUiBlur] = useState([appearance.uiBlur]);
  const [bgBlur, setBgBlur] = useState([appearance.backgroundBlur]);
  const [backgroundImage, setBackgroundImage] = useState(appearance.backgroundImage);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTheme(appearance.theme);
    setUiOpacity([appearance.uiOpacity]);
    setUiBlur([appearance.uiBlur]);
    setBgBlur([appearance.backgroundBlur]);
    setBackgroundImage(appearance.backgroundImage);
  }, [open, appearance]);

  const draftAppearance = useMemo(
    () => ({
      theme,
      uiOpacity: uiOpacity[0] ?? appearance.uiOpacity,
      uiBlur: uiBlur[0] ?? appearance.uiBlur,
      backgroundBlur: bgBlur[0] ?? appearance.backgroundBlur,
      backgroundImage: backgroundImage ?? appearance.backgroundImage,
    }),
    [theme, uiOpacity, uiBlur, bgBlur, backgroundImage, appearance],
  );

  useEffect(() => {
    if (!open) return;
    previewAppearance(draftAppearance);
  }, [open, draftAppearance, previewAppearance]);

  const navItems = [
    { id: "profile", label: t("settings.tabProfile"), icon: User },
    { id: "apis", label: t("settings.tabApis"), icon: Sparkles },
    { id: "personalization", label: t("settings.tabPersonalization"), icon: Palette },
    { id: "language", label: t("settings.tabLanguage"), icon: Languages },
    { id: "news", label: t("settings.tabNews"), icon: Newspaper },
    { id: "help", label: t("settings.tabHelp"), icon: HelpCircle },
  ];

  const [googleStatus, setGoogleStatus] = useState<{ loading: boolean; connected: boolean; email: string | null }>({
    loading: false,
    connected: false,
    email: null,
  });

  const refreshGoogleStatus = async () => {
    setGoogleStatus((prev) => ({ ...prev, loading: true }));
    try {
      const token = await getAccessToken();
      if (!token) {
        setGoogleStatus({ loading: false, connected: false, email: null });
        return;
      }
      const response = await fetch("/api/google/oauth/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: any = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setGoogleStatus({ loading: false, connected: false, email: null });
        return;
      }
      setGoogleStatus({ loading: false, connected: Boolean(data.connected), email: data.email ?? null });
    } catch {
      setGoogleStatus({ loading: false, connected: false, email: null });
    }
  };

  const connectGoogle = async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch("/api/google/oauth/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: ["calendar", "drive"], returnTo: "/" }),
      });
      const data: any = await response.json().catch(() => null);
      if (!response.ok || !data?.authUrl) throw new Error(data?.error || "OAuth start failed");
      window.location.href = data.authUrl;
    } catch (err: any) {
      toast({
        title: "Google",
        description: err?.message ?? "No se pudo iniciar la conexión",
        variant: "destructive",
      });
    }
  };

  const disconnectGoogle = async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      await fetch("/api/google/oauth/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshGoogleStatus();
    } catch (err: any) {
      toast({
        title: "Google",
        description: err?.message ?? "No se pudo desconectar",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    saveProfile(profileData);
    saveAppearance(draftAppearance);
    onOpenChange(false);
  };

  const handleClose = () => {
    resetPreview();
    onOpenChange(false);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetPreview();
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (!open) return;
    if (activeTab !== "apis") return;
    refreshGoogleStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab]);

  const handleSelectBackgroundFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 2_000_000) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) setBackgroundImage(result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
                      <div className="flex items-center gap-3">
                        <span className={cn("text-xs", googleStatus.connected ? "text-success" : "text-muted-foreground")}>
                          {googleStatus.connected ? (googleStatus.email ?? t("settings.apisActive")) : t("settings.apisConnect")}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => (googleStatus.connected ? refreshGoogleStatus() : connectGoogle())}
                          disabled={googleStatus.loading}
                        >
                          {googleStatus.connected ? t("settings.refresh") : t("settings.apisConnect")}
                        </Button>
                        {googleStatus.connected ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={disconnectGoogle}
                            disabled={googleStatus.loading}
                          >
                            Desconectar
                          </Button>
                        ) : null}
                      </div>
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
                    <input
                      ref={backgroundInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleSelectBackgroundFile(file);
                        e.currentTarget.value = "";
                      }}
                    />
                    <div className="flex items-center gap-3">
                      <Button
                        variant="upload"
                        size="sm"
                        className="gap-2"
                        type="button"
                        onClick={() => backgroundInputRef.current?.click()}
                      >
                      <Upload className="w-4 h-4" />
                      {t("settings.uploadFromComputer")}
                      </Button>
                      {backgroundImage ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="h-9 w-14 rounded-md border border-border bg-cover bg-center shrink-0"
                            style={{ backgroundImage: `url(${backgroundImage})` }}
                          />
                          <Button variant="outline" size="sm" type="button" onClick={() => setBackgroundImage("")}>
                            {t("settings.remove")}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{t("settings.none")}</p>
                      )}
                    </div>
                  </div>

                  {/* Preset Backgrounds */}
                  <div className="space-y-3">
                    <Label>{t("settings.presetBackgrounds")}</Label>
                    <div className="flex gap-3">
                      {(() => {
                        const presets = [
                          "https://images.unsplash.com/photo-1501691223387-dd0500403074?w=1200&auto=format&fit=crop",
                          "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&auto=format&fit=crop",
                          "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=1200&auto=format&fit=crop",
                        ];
                        return presets.map((url) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => setBackgroundImage(url)}
                            className={cn(
                              "w-24 h-16 rounded-lg border-2 transition-colors overflow-hidden bg-cover bg-center",
                              backgroundImage === url
                                ? "border-primary"
                                : "border-transparent hover:border-primary/50",
                            )}
                            style={{ backgroundImage: `url(${url})` }}
                            aria-label={t("settings.backgroundImage")}
                          />
                        ));
                      })()}
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
            <Button variant="outline" onClick={handleClose}>
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
