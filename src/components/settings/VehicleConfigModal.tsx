import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";

interface VehicleConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VehicleConfigModal({ open, onOpenChange }: VehicleConfigModalProps) {
  const { t } = useI18n();
  const [vehicleType, setVehicleType] = useState("combustion");
  const [fuelConsumption, setFuelConsumption] = useState("12");
  const [fuelPrice, setFuelPrice] = useState("1,8");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("vehicleConfig.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t("vehicleConfig.vehicleType")}</Label>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="combustion">{t("vehicleConfig.typeCombustion")}</SelectItem>
                <SelectItem value="electric">{t("vehicleConfig.typeElectric")}</SelectItem>
                <SelectItem value="hybrid">{t("vehicleConfig.typeHybrid")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t("vehicleConfig.fuelConsumption")}</Label>
            <Input
              type="text"
              value={fuelConsumption}
              onChange={(e) => setFuelConsumption(e.target.value)}
              className="bg-secondary/50"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t("vehicleConfig.fuelPrice")}</Label>
            <Input
              type="text"
              value={fuelPrice}
              onChange={(e) => setFuelPrice(e.target.value)}
              className="bg-secondary/50"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

