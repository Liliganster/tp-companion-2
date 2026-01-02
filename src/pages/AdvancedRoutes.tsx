import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface RouteTemplate {
  id: string;
  name: string;
  category: string;
  startLocation: string;
  endLocation: string;
  distance: number;
  estimatedTime: number;
  description: string;
  uses: number;
}

type DbRouteTemplate = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  start_location: string | null;
  end_location: string | null;
  distance_km: number | null;
  estimated_time_min: number | null;
  description: string | null;
  uses: number | null;
  created_at: string;
};

export default function AdvancedRoutes() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<RouteTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    category: "business",
    startLocation: "",
    endLocation: "",
    distance: 0,
    estimatedTime: 0,
    description: "",
  });

  const filteredTemplates = useMemo(
    () => (selectedCategory === "all" ? templates : templates.filter((t) => t.category === selectedCategory)),
    [selectedCategory, templates],
  );

  const avgDistance = useMemo(
    () => (templates.length > 0 ? templates.reduce((acc, t) => acc + t.distance, 0) / templates.length : 0),
    [templates],
  );

  const mostUsed = useMemo(
    () =>
      templates.length > 0
        ? templates.reduce((max, t) => (t.uses > max.uses ? t : max), templates[0])?.name
        : t("advancedRoutes.none"),
    [t, templates],
  );

  const mapDbToUi = (row: DbRouteTemplate): RouteTemplate => ({
    id: row.id,
    name: row.name,
    category: row.category,
    startLocation: row.start_location ?? "",
    endLocation: row.end_location ?? "",
    distance: Number(row.distance_km ?? 0),
    estimatedTime: Number(row.estimated_time_min ?? 0),
    description: row.description ?? "",
    uses: Number(row.uses ?? 0),
  });

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!supabase || !user) {
        setTemplates([]);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("route_templates")
          .select("id, user_id, name, category, start_location, end_location, distance_km, estimated_time_min, description, uses, created_at")
          .order("created_at", { ascending: false });

        if (error) throw error;
        const rows = (data ?? []) as DbRouteTemplate[];
        if (!mounted) return;
        setTemplates(rows.map(mapDbToUi));
      } catch (err: any) {
        console.error("Failed to load route templates:", err);
        toast.error(String(err?.message ?? t("advancedRoutes.toastLoadError")));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [t, user]);

  const categories = [
    { id: "all", label: t("advancedRoutes.categoryAll") },
    { id: "business", label: t("advancedRoutes.categoryBusiness") },
    { id: "commute", label: t("advancedRoutes.categoryCommute") },
    { id: "client", label: t("advancedRoutes.categoryClient") },
    { id: "other", label: t("advancedRoutes.categoryOther") },
  ];

  const resetForm = () => {
    setFormData({
      name: "",
      category: "business",
      startLocation: "",
      endLocation: "",
      distance: 0,
      estimatedTime: 0,
      description: "",
    });
  };

  const closeModal = () => {
    setCreateModalOpen(false);
    setEditingTemplateId(null);
    resetForm();
  };

  const openCreateModal = () => {
    setEditingTemplateId(null);
    resetForm();
    setCreateModalOpen(true);
  };

  const openEditModal = (template: RouteTemplate) => {
    setEditingTemplateId(template.id);
    setFormData({
      name: template.name,
      category: template.category,
      startLocation: template.startLocation,
      endLocation: template.endLocation,
      distance: template.distance,
      estimatedTime: template.estimatedTime,
      description: template.description,
    });
    setCreateModalOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!supabase || !user) {
      toast.error(t("advancedRoutes.toastLoginRequired"));
      return;
    }

    const name = formData.name.trim();
    if (!name) {
      toast.error(t("advancedRoutes.toastNameRequired"));
      return;
    }

    setLoading(true);
    try {
      if (editingTemplateId) {
        const payload = {
          name,
          category: formData.category,
          start_location: formData.startLocation || null,
          end_location: formData.endLocation || null,
          distance_km: Number.isFinite(Number(formData.distance)) ? Number(formData.distance) : 0,
          estimated_time_min: Number.isFinite(Number(formData.estimatedTime)) ? Number(formData.estimatedTime) : 0,
          description: formData.description || null,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("route_templates")
          .update(payload)
          .eq("id", editingTemplateId)
          .select("id, user_id, name, category, start_location, end_location, distance_km, estimated_time_min, description, uses, created_at")
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error(t("advancedRoutes.errorUpdateFailed"));

        const updated = mapDbToUi(data as DbRouteTemplate);
        setTemplates((prev) => prev.map((t) => (t.id === editingTemplateId ? { ...t, ...updated } : t)));
        closeModal();
        toast.success(t("advancedRoutes.toastUpdated"));
      } else {
        const payload = {
          user_id: user.id,
          name,
          category: formData.category,
          start_location: formData.startLocation || null,
          end_location: formData.endLocation || null,
          distance_km: Number.isFinite(Number(formData.distance)) ? Number(formData.distance) : 0,
          estimated_time_min: Number.isFinite(Number(formData.estimatedTime)) ? Number(formData.estimatedTime) : 0,
          description: formData.description || null,
          uses: 0,
        };

        const { data, error } = await supabase
          .from("route_templates")
          .insert(payload)
          .select("id, user_id, name, category, start_location, end_location, distance_km, estimated_time_min, description, uses, created_at")
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error(t("advancedRoutes.errorCreateFailed"));

        setTemplates((prev) => [mapDbToUi(data as DbRouteTemplate), ...prev]);
        closeModal();
        toast.success(t("advancedRoutes.toastCreated"));
      }
    } catch (err: any) {
      console.error("Failed to save route template:", err);
      toast.error(String(err?.message ?? t("advancedRoutes.toastSaveFailed")));
    } finally {
      setLoading(false);
    }
  };

  const bumpUses = async (template: RouteTemplate) => {
    if (!supabase || !user) return;
    const nextUses = (Number(template.uses) || 0) + 1;
    setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, uses: nextUses } : t)));
    const { error } = await supabase
      .from("route_templates")
      .update({ uses: nextUses, updated_at: new Date().toISOString() })
      .eq("id", template.id);
    if (error) {
      console.error("Failed to update uses:", error);
      toast.error(t("advancedRoutes.toastUsesUpdateFailed"));
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, uses: template.uses } : t)));
    }
  };

  const handleUseTemplate = (template: RouteTemplate) => {
    const origin = (template.startLocation ?? "").trim();
    const destination = (template.endLocation ?? "").trim();

    if (!origin || !destination) {
      toast.error("La plantilla necesita origen y destino");
      return;
    }

    void bumpUses(template);

    navigate("/trips", {
      state: {
        tripPrefill: {
          route: [origin, destination],
          distance: Number(template.distance) || 0,
          purpose: template.description || "",
        },
      },
    });
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 animate-fade-in">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/advanced")} className="shrink-0 mt-1">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{t("advancedRoutes.pageTitle")}</h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                {t("advancedRoutes.pageSubtitle")}
              </p>
            </div>
          </div>
          <Button variant="add" onClick={() => setCreateModalOpen(true)} className="shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            {t("advancedRoutes.createTemplate")}
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in animation-delay-100">
          <div className="glass-card p-5">
            <p className="text-xs uppercase text-muted-foreground tracking-wider mb-2">{t("advancedRoutes.statTotalTemplates")}</p>
            <p className="text-2xl sm:text-3xl font-bold">{templates.length}</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs uppercase text-muted-foreground tracking-wider mb-2">{t("advancedRoutes.statAvgDistance")}</p>
            <p className="text-2xl sm:text-3xl font-bold">{avgDistance.toFixed(1)} km</p>
          </div>
          <div className="glass-card p-5">
            <p className="text-xs uppercase text-muted-foreground tracking-wider mb-2">{t("advancedRoutes.statMostUsed")}</p>
            <p className="text-2xl sm:text-3xl font-bold truncate">{mostUsed}</p>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 animate-fade-in animation-delay-200">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                selectedCategory === cat.id
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Templates List */}
        {filteredTemplates.length > 0 ? (
          <div className="space-y-3 animate-fade-in animation-delay-300">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-secondary/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{template.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {template.startLocation} → {template.endLocation} • {template.distance} km
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openEditModal(template)} disabled={loading}>
                    Editar
                  </Button>
                  <Button size="sm" onClick={() => handleUseTemplate(template)} disabled={loading}>
                    Usar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card p-12 text-center animate-fade-in animation-delay-300">
            <p className="text-muted-foreground">
              {loading ? "Cargando…" : "No hay plantillas en esta categoría. Crea tu primera plantilla para empezar."}
            </p>
          </div>
        )}
      </div>

      {/* Create Template Modal */}
      <Dialog
        open={createModalOpen}
        onOpenChange={(open) => {
          if (open) setCreateModalOpen(true);
          else closeModal();
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplateId ? t("advancedRoutes.editTemplateTitle") : t("advancedRoutes.createTemplateTitle")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingTemplateId ? t("advancedRoutes.editTemplateTitle") : t("advancedRoutes.createTemplateTitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Información básica */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">{t("advancedRoutes.basicInfo")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("advancedRoutes.templateName")}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-secondary/50"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">{t("advancedRoutes.category")}</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                    disabled={loading}
                  >
                    <SelectTrigger className="bg-secondary/50" disabled={loading}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="business">{t("advancedRoutes.categoryBusiness")}</SelectItem>
                      <SelectItem value="commute">{t("advancedRoutes.categoryCommute")}</SelectItem>
                      <SelectItem value="client">{t("advancedRoutes.categoryClient")}</SelectItem>
                      <SelectItem value="other">{t("advancedRoutes.categoryOther")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Detalles de ruta */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">{t("advancedRoutes.routeDetails")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startLocation">{t("advancedRoutes.startLocation")}</Label>
                  <Input
                    id="startLocation"
                    value={formData.startLocation}
                    onChange={(e) => setFormData({ ...formData, startLocation: e.target.value })}
                    className="bg-secondary/50"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endLocation">{t("advancedRoutes.endLocation")}</Label>
                  <Input
                    id="endLocation"
                    value={formData.endLocation}
                    onChange={(e) => setFormData({ ...formData, endLocation: e.target.value })}
                    className="bg-secondary/50"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="distance">{t("advancedRoutes.distanceKm")}</Label>
                  <Input
                    id="distance"
                    type="number"
                    value={formData.distance}
                    onChange={(e) => setFormData({ ...formData, distance: Number(e.target.value) })}
                    className="bg-secondary/50"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estimatedTime">{t("advancedRoutes.estimatedTimeMin")}</Label>
                  <Input
                    id="estimatedTime"
                    type="number"
                    value={formData.estimatedTime}
                    onChange={(e) => setFormData({ ...formData, estimatedTime: Number(e.target.value) })}
                    className="bg-secondary/50"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Detalles adicionales */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">{t("advancedRoutes.additionalDetails")}</h3>
              <div className="space-y-2">
                <Label htmlFor="description">{t("advancedRoutes.description")}</Label>
                <Textarea
                  id="description"
                  placeholder={t("advancedRoutes.descriptionPlaceholder")}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-secondary/50 resize-none min-h-[100px]"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={closeModal} disabled={loading}>
              {t("advancedRoutes.cancel")}
            </Button>
            <Button variant="add" onClick={handleSaveTemplate} disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              {editingTemplateId ? t("advancedRoutes.saveChanges") : t("advancedRoutes.createTemplate")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
