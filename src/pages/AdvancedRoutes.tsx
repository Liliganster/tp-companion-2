import { useState } from "react";
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

export default function AdvancedRoutes() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [templates, setTemplates] = useState<RouteTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  
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

  const filteredTemplates = selectedCategory === "all"
    ? templates
    : templates.filter(t => t.category === selectedCategory);

  const avgDistance = templates.length > 0
    ? templates.reduce((acc, t) => acc + t.distance, 0) / templates.length
    : 0;

  const mostUsed = templates.length > 0
    ? templates.reduce((max, t) => t.uses > max.uses ? t : max, templates[0])?.name
    : t("advancedRoutes.none");

  const categories = [
    { id: "all", label: t("advancedRoutes.categoryAll") },
    { id: "business", label: t("advancedRoutes.categoryBusiness") },
    { id: "commute", label: t("advancedRoutes.categoryCommute") },
    { id: "client", label: t("advancedRoutes.categoryClient") },
    { id: "other", label: t("advancedRoutes.categoryOther") },
  ];

  const handleCreateTemplate = () => {
    const newTemplate: RouteTemplate = {
      id: Date.now().toString(),
      ...formData,
      uses: 0,
    };
    setTemplates([...templates, newTemplate]);
    setCreateModalOpen(false);
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
                  <Button variant="outline" size="sm">
                    Editar
                  </Button>
                  <Button size="sm">
                    Usar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card p-12 text-center animate-fade-in animation-delay-300">
            <p className="text-muted-foreground">
              No hay plantillas en esta categoría. Crea tu primera plantilla para empezar.
            </p>
          </div>
        )}
      </div>

      {/* Create Template Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("advancedRoutes.createTemplateTitle")}</DialogTitle>
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">{t("advancedRoutes.category")}</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger className="bg-secondary/50">
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endLocation">{t("advancedRoutes.endLocation")}</Label>
                  <Input
                    id="endLocation"
                    value={formData.endLocation}
                    onChange={(e) => setFormData({ ...formData, endLocation: e.target.value })}
                    className="bg-secondary/50"
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
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              {t("advancedRoutes.cancel")}
            </Button>
            <Button variant="add" onClick={handleCreateTemplate}>
              <Plus className="w-4 h-4 mr-2" />
              {t("advancedRoutes.createTemplate")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
