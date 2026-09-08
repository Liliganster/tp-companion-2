import { useI18n } from "@/hooks/use-i18n";

export function CallsheetUploadHelp({ maxFiles }: { maxFiles: number }) {
  const { t, tf } = useI18n();
  return (
    <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
      <p>{t("uploads.callsheetFormats")}</p>
      <p>{tf("uploads.callsheetLimits", { count: maxFiles })}</p>
      <p>{t("uploads.callsheetConversion")}</p>
    </div>
  );
}
