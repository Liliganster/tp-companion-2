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

interface ProjectEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  onSave: (data: {
    name: string;
    producer?: string;
    description?: string;
    ratePerKm: number;
    // ratePerPassenger logic seems unused but present in UI
    ratePerPassenger?: number;
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
  const [ratePerPassenger, setRatePerPassenger] = useState("0.05");

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
        // Passenger rate is not in project type yet, default or keep previous if needed?
        // UI defaulted to 0.05
        setRatePerPassenger("0.05");
      } else {
        // Create mode
        setName("");
        setProducer("");
        setDescription("");
        setRatePerKm("0.30");
        setRatePerPassenger("0.05");
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
      
      const parsedPassenger = parseFloat(ratePerPassenger.replace(",", "."));
      const finalPassenger = Number.isFinite(parsedPassenger) ? parsedPassenger : 0;

      await onSave({
        name: trimmedName,
        producer: producer.trim() || undefined,
        description: description.trim() || undefined,
        ratePerKm: finalRate,
        ratePerPassenger: finalPassenger,
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
      <DialogContent className="glass max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {project ? t("projects.edit") : t("projects.createNewProject")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {project ? t("projects.edit") : t("projects.createNewProject")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{t("projects.projectName")}</Label>
            <Input
              id="name"
              placeholder="e.g., Film Production XY"
              className="bg-secondary/50"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="producer">{t("projects.company")}</Label>
            <Input
              id="producer"
              placeholder={t("projects.companyPlaceholder")}
              className="bg-secondary/50"
              value={producer}
              onChange={(e) => setProducer(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">{t("projects.description")}</Label>
            <Textarea
              id="description"
              placeholder={t("projects.descriptionPlaceholder")}
              className="bg-secondary/50 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="rate">{t("projects.ratePerKm")}</Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                placeholder="0.30"
                className="bg-secondary/50"
                value={ratePerKm}
                onChange={(e) => setRatePerKm(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ratePassenger">{t("projects.ratePerPassenger")}</Label>
              <Input
                id="ratePassenger"
                type="number"
                step="0.01"
                placeholder="0.05"
                className="bg-secondary/50"
                value={ratePerPassenger}
                onChange={(e) => setRatePerPassenger(e.target.value)}
              />
            </div>
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
      </DialogContent>
    </Dialog>
  );
}
