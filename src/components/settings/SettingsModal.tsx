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

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const navItems = [
  { id: "profile", label: "Perfil", icon: User },
  { id: "apis", label: "APIs y servicios externos", icon: Sparkles },
  { id: "personalization", label: "Personalización", icon: Palette },
  { id: "language", label: "Idioma", icon: Languages },
  { id: "news", label: "Novedades", icon: Newspaper },
  { id: "help", label: "Ayuda y docs", icon: HelpCircle },
];

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState("profile");

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

  const handleSave = () => {
    saveProfile(profileData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[800px] h-[600px] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-xl font-semibold">Ajustes</DialogTitle>
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
                  <h2 className="text-lg font-medium">Mi perfil</h2>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Nombre completo</Label>
                      <Input
                        id="fullName"
                        value={profileData.fullName}
                        onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vatId">NIF / VAT ID (UID)</Label>
                      <Input
                        id="vatId"
                        value={profileData.vatId}
                        onChange={(e) => setProfileData({ ...profileData, vatId: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="licensePlate">Matrícula</Label>
                      <Input
                        id="licensePlate"
                        value={profileData.licensePlate}
                        onChange={(e) => setProfileData({ ...profileData, licensePlate: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ratePerKm">Tarifa (€/km)</Label>
                      <Input
                        id="ratePerKm"
                        value={profileData.ratePerKm}
                        onChange={(e) => setProfileData({ ...profileData, ratePerKm: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="passengerSurcharge">Recargo por pasajero (€/km)</Label>
                    <Input
                      id="passengerSurcharge"
                      value={profileData.passengerSurcharge}
                      onChange={(e) => setProfileData({ ...profileData, passengerSurcharge: e.target.value })}
                      className="bg-secondary/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="baseAddress">Dirección base / Domicilio</Label>
                    <Input
                      id="baseAddress"
                      value={profileData.baseAddress}
                      onChange={(e) => setProfileData({ ...profileData, baseAddress: e.target.value })}
                      className="bg-secondary/50"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">Ciudad</Label>
                      <Input
                        id="city"
                        value={profileData.city}
                        onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">País</Label>
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
                        <h3 className="font-medium text-destructive">Eliminar cuenta</h3>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">
                          Esto eliminará permanentemente todos tus viajes, proyectos, facturas, informes y ajustes personalizados asociados a tu perfil.
                        </p>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Eliminar mi cuenta
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}


              {activeTab === "apis" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-medium">APIs y servicios externos</h2>
                  <div className="glass-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Gemini AI (Default)</h3>
                        <p className="text-sm text-muted-foreground">Server-side AI for callsheet parsing</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-success">
                        <div className="w-2 h-2 rounded-full bg-success" />
                        Activo
                      </div>
                    </div>
                  </div>

                  <div className="glass-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">OpenRouter (Opcional)</h3>
                        <p className="text-sm text-muted-foreground">Usa tu propia API key</p>
                      </div>
                      <Switch />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="openrouter">API Key</Label>
                      <Input id="openrouter" type="password" placeholder="sk-..." className="bg-secondary/50" />
                    </div>
                  </div>

                  <div className="glass-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Google Calendar</h3>
                        <p className="text-sm text-muted-foreground">Sincronizar eventos</p>
                      </div>
                      <Button variant="outline" size="sm">Conectar</Button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "personalization" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-medium">Ajustes de apariencia</h2>
                  
                  {/* Theme */}
                  <div className="space-y-3">
                    <Label>Tema</Label>
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
                          <h4 className="font-medium text-sm">Claro {theme === "light" && "(actual)"}</h4>
                          <p className="text-xs text-muted-foreground mt-1">Fondos claros y efecto vidrio suave.</p>
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
                          <h4 className="font-medium text-sm">Oscuro {theme === "dark" && "(actual)"}</h4>
                          <p className="text-xs text-muted-foreground mt-1">Mayor contraste para ambientes con poca luz.</p>
                        </div>
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">Cambia entre claro y oscuro sin tocar el resto de estilos.</p>
                  </div>

                  {/* Background Image */}
                  <div className="space-y-3">
                    <Label>Imagen de fondo</Label>
                    <Button variant="upload" className="gap-2">
                      <Upload className="w-4 h-4" />
                      Subir desde el ordenador
                    </Button>
                  </div>

                  {/* Preset Backgrounds */}
                  <div className="space-y-3">
                    <Label>Fondos preestablecidos</Label>
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
                      <Label>Opacidad de la IU</Label>
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
                      <Label>Efecto de desenfoque de la IU</Label>
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
                      <Label>Desenfoque de imagen de fondo</Label>
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
                  <h2 className="text-lg font-medium">Idioma</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { code: "de", name: "Deutsch" },
                      { code: "en", name: "English" },
                      { code: "es", name: "Español" },
                    ].map((lang) => (
                      <button
                        key={lang.code}
                        className={cn(
                          "p-3 rounded-lg border transition-colors text-left",
                          lang.code === "es"
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
                  <h2 className="text-lg font-medium">Novedades</h2>
                  <div className="glass-card p-4 space-y-2">
                    <h3 className="font-medium">Versión de la aplicación</h3>
                    <p className="text-sm text-muted-foreground">Fahrtenbuch Pro v1.0.0</p>
                    <Button variant="outline" size="sm">Buscar actualizaciones</Button>
                  </div>

                  <div className="glass-card p-4 space-y-2">
                    <h3 className="font-medium">Changelog</h3>
                    <p className="text-sm text-muted-foreground">Ver cambios recientes y actualizaciones</p>
                    <Button variant="outline" size="sm">Ver Changelog</Button>
                  </div>
                </div>
              )}

              {activeTab === "help" && (
                <div className="space-y-6">
                  <h2 className="text-lg font-medium">Ayuda y documentación</h2>
                  <div className="glass-card p-4 space-y-2">
                    <h3 className="font-medium">Documentación</h3>
                    <p className="text-sm text-muted-foreground">Aprende a usar todas las funciones</p>
                    <Button variant="outline" size="sm">Ver documentación</Button>
                  </div>

                  <div className="glass-card p-4 space-y-2">
                    <h3 className="font-medium">Soporte</h3>
                    <p className="text-sm text-muted-foreground">¿Necesitas ayuda? Contáctanos</p>
                    <Button variant="outline" size="sm">Contactar soporte</Button>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Build: 1fded46 @ 2025-12-20T20:43:47.046Z
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="save" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Guardar ajustes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
