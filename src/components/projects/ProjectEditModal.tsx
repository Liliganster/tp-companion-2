import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { Project } from "@/contexts/ProjectsContext";
import { Loader2 } from "lucide-react";
import { logger } from "@/lib/logger";
import { ModalHeaderImage } from "@/components/ui/modal-header-image";

interface ProjectEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  onSave: (data: {
    name: string;
    producer?: string;
    description?: string;
    ratePerKm: number;
  }) => Promise<void>;
}

export function ProjectEditModal({
  open,
  onOpenChange,
  project,
  onSave,
}: ProjectEditModalProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [producer, setProducer] = useState("");
  const [description, setDescription] = useState("");
  const [ratePerKm, setRatePerKm] = useState("0.30");

  // Reset form when opening or changing project
  useEffect(() => {
    if (open) {
      if (project) {
        setName(project.name ?? "");
        setProducer(project.producer ?? "");
        setDescription(project.description ?? "");
        setRatePerKm(
          typeof project.ratePerKm === "number" && Number.isFinite(project.ratePerKm)
            ? String(project.ratePerKm)
            : "0.30"
        );
      } else {
        // Create mode
        setName("");
        setProducer("");
        setDescription("");
        setRatePerKm("0.30");
      }
    }
  }, [open, project]);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return; // Parent should handle validation or we do it here

    setLoading(true);
    try {
      const parsedRate = parseFloat(ratePerKm.replace(",", "."));
      const finalRate = Number.isFinite(parsedRate) ? parsedRate : 0;

      await onSave({
        name: trimmedName,
        producer: producer.trim() || undefined,
        description: description.trim() || undefined,
        ratePerKm: finalRate,
      });
      onOpenChange(false);
    } catch (e) {
      logger.warn("ProjectEditModal save error", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <ModalHeaderImage />
        <div className="px-6 pb-6">
          <DialogHeader className="pb-4">
            <DialogTitle>
              {project ? t("projects.edit") : t("projects.createNewProject")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {project ? t("projects.edit") : t("projects.createNewProject")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{t("projects.projectName")}</Label>
            <Input
              id="name"
              placeholder="e.g., Film Production XY"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="producer">{t("projects.company")}</Label>
            <Input
              id="producer"
              placeholder={t("projects.companyPlaceholder")}
              value={producer}
              onChange={(e) => setProducer(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">{t("projects.description")}</Label>
            <Textarea
              id="description"
              placeholder={t("projects.descriptionPlaceholder")}
              className="resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rate">{t("projects.ratePerKm")}</Label>
            <Input
              id="rate"
              type="number"
              step="0.01"
              placeholder="0.30"
              value={ratePerKm}
              onChange={(e) => setRatePerKm(e.target.value)}
            />
          </div>
            <Button className="w-full mt-2" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : project ? (
                t("projects.edit")
              ) : (
                t("projects.createProject")
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
