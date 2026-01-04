import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";
import { toast } from "sonner";
import { useClimatiqFuelFactor } from "@/hooks/use-climatiq";
import { useElectricityMapsCarbonIntensity } from "@/hooks/use-electricity-maps";
import { Info, ExternalLink } from "lucide-react";

interface VehicleConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VehicleConfigModal({ open, onOpenChange }: VehicleConfigModalProps) {
  const { t } = useI18n();
  const { profile, saveProfile } = useUserProfile();

  const [fuelType, setFuelType] = useState(profile.fuelType ?? "unknown");
  const [fuelConsumption, setFuelConsumption] = useState(profile.fuelLPer100Km ?? "");
  const [fuelPrice, setFuelPrice] = useState(profile.fuelPricePerLiter ?? "");
  const [evConsumption, setEvConsumption] = useState(profile.evKwhPer100Km ?? "");
  const [electricityPrice, setElectricityPrice] = useState(profile.electricityPricePerKwh ?? "");
  const [maintenancePerKm, setMaintenancePerKm] = useState(profile.maintenanceEurPerKm ?? "");
  const [otherPerKm, setOtherPerKm] = useState(profile.otherEurPerKm ?? "");
  const [saving, setSaving] = useState(false);

  const isElectric = fuelType === "ev";

  const { data: fuelFactor } = useClimatiqFuelFactor(
    fuelType === "gasoline" || fuelType === "diesel" ? fuelType : null,
    { enabled: fuelType === "gasoline" || fuelType === "diesel" },
  );
  const { data: gridData } = useElectricityMapsCarbonIntensity("AT", {
    enabled: fuelType === "ev",
  });

  useEffect(() => {
    if (!open) return;
    setFuelType(profile.fuelType ?? "unknown");
    setFuelConsumption(profile.fuelLPer100Km ?? "");
    setFuelPrice(profile.fuelPricePerLiter ?? "");
    setEvConsumption(profile.evKwhPer100Km ?? "");
    setElectricityPrice(profile.electricityPricePerKwh ?? "");
    setMaintenancePerKm(profile.maintenanceEurPerKm ?? "");
    setOtherPerKm(profile.otherEurPerKm ?? "");
  }, [open, profile]);

  const estimatedFuelPerKm = useMemo(() => {
    if (isElectric) {
      const kwhPer100 = parseLocaleNumber(evConsumption) ?? 0;
      const price = parseLocaleNumber(electricityPrice) ?? 0;
      if (kwhPer100 <= 0 || price <= 0) return 0;
      return (kwhPer100 / 100) * price;
    }
    const lPer100 = parseLocaleNumber(fuelConsumption) ?? 0;
    const price = parseLocaleNumber(fuelPrice) ?? 0;
    if (lPer100 <= 0 || price <= 0) return 0;
    return (lPer100 / 100) * price;
  }, [electricityPrice, evConsumption, fuelConsumption, fuelPrice, isElectric]);

  const handleSave = async () => {
    if (saving) return;

    const fields: Array<{ key: string; value: string }> = [
      { key: isElectric ? "vehicleConfig.evConsumption" : "vehicleConfig.fuelConsumption", value: isElectric ? evConsumption : fuelConsumption },
      { key: isElectric ? "vehicleConfig.energyPrice" : "vehicleConfig.fuelPrice", value: isElectric ? electricityPrice : fuelPrice },
      { key: "vehicleConfig.maintenancePerKm", value: maintenancePerKm },
      { key: "vehicleConfig.otherPerKm", value: otherPerKm },
    ];

    for (const f of fields) {
      const raw = String(f.value ?? "").trim();
      if (!raw) continue;
      if (parseLocaleNumber(raw) == null) {
        // Keep it simple and explicit; prevents silent "null" writes.
        toast.error(`${t("vehicleConfig.invalidNumber")}: ${t(f.key as any)}`, { id: "vehicle-config-validate" });
        return;
      }
    }

    setSaving(true);
    const ok = await saveProfile(
      {
        ...profile,
        fuelType,
        fuelLPer100Km: isElectric ? "" : fuelConsumption,
        evKwhPer100Km: isElectric ? evConsumption : "",
        fuelPricePerLiter: isElectric ? "" : fuelPrice,
        electricityPricePerKwh: isElectric ? electricityPrice : "",
        maintenanceEurPerKm: maintenancePerKm,
        otherEurPerKm: otherPerKm,
      },
      {
        toastId: "vehicle-config-save",
        loadingText: t("vehicleConfig.toastSaving"),
        successText: t("vehicleConfig.toastSaved"),
      },
    );
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("vehicleConfig.title")}</DialogTitle>
          <DialogDescription>{t("vehicleConfig.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t("vehicleConfig.vehicleType")}</Label>
            <Select value={fuelType} onValueChange={(v) => setFuelType(v as any)}>
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">{t("vehicleConfig.typeUnknown")}</SelectItem>
                <SelectItem value="gasoline">{t("vehicleConfig.typeGasoline")}</SelectItem>
                <SelectItem value="diesel">{t("vehicleConfig.typeDiesel")}</SelectItem>
                <SelectItem value="ev">{t("vehicleConfig.typeEv")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              {isElectric ? t("vehicleConfig.evConsumption") : t("vehicleConfig.fuelConsumption")}
            </Label>
            <Input
              type="text"
              value={isElectric ? evConsumption : fuelConsumption}
              onChange={(e) => (isElectric ? setEvConsumption(e.target.value) : setFuelConsumption(e.target.value))}
              className="bg-secondary/50"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              {isElectric ? t("vehicleConfig.energyPrice") : t("vehicleConfig.fuelPrice")}
            </Label>
            <Input
              type="text"
              value={isElectric ? electricityPrice : fuelPrice}
              onChange={(e) => (isElectric ? setElectricityPrice(e.target.value) : setFuelPrice(e.target.value))}
              className="bg-secondary/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-2">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t("vehicleConfig.maintenancePerKm")}</Label>
            <Input
              type="text"
              value={maintenancePerKm}
              onChange={(e) => setMaintenancePerKm(e.target.value)}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t("vehicleConfig.otherPerKm")}</Label>
            <Input
              type="text"
              value={otherPerKm}
              onChange={(e) => setOtherPerKm(e.target.value)}
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">{t("vehicleConfig.estimatedFuelPerKm")}</Label>
            <Input type="text" value={estimatedFuelPerKm.toFixed(2).replace(".", ",")} readOnly className="bg-secondary/30" />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("vehicleConfig.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t("vehicleConfig.saving") : t("vehicleConfig.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
