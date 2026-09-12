import { FormSection } from "@/components/ui/form-section";
import { useI18n } from "@/hooks/use-i18n";

export function CallsheetUploadHelp({ maxFiles }: { maxFiles: number }) {
  const { t, tf } = useI18n();
  return (
    <div className="w-full space-y-2 text-xs leading-relaxed text-muted-foreground">
      <p>{tf("modal.uploadLimit", { count: maxFiles })}</p>
      <FormSection title={t("modal.uploadHelp")}>
      <p>{t("uploads.callsheetFormats")}</p>
      <p>{tf("uploads.callsheetLimits", { count: maxFiles })}</p>
      <p>{t("uploads.callsheetConversion")}</p>
      <p>{t("uploads.fileNameHint")}</p>
      </FormSection>
    </div>
  );
}
