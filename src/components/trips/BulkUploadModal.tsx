import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Sparkles, FileSpreadsheet, CloudUpload } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/hooks/use-i18n";

interface BulkUploadModalProps {
  trigger: React.ReactNode;
}

export function BulkUploadModal({ trigger }: BulkUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const { t } = useI18n();

  const exampleText = t("bulk.examplePlaceholder");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>{t("bulk.title")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="csv" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="csv" className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              {t("bulk.tabCsv")}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="w-4 h-4" />
              {t("bulk.tabAi")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-6">
            <div className="rounded-lg border border-border/50 bg-secondary/30 p-4 space-y-3">
              <h4 className="font-semibold text-sm uppercase tracking-wide">{t("bulk.csvInstructionsTitle")}</h4>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>{t("bulk.csvInstructionsRequired")}</li>
                <li>{t("bulk.csvInstructionsStops")}</li>
                <li>{t("bulk.csvInstructionsSeparator")}</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="h-12 gap-2">
                <Upload className="w-4 h-4" />
                {t("bulk.selectCsvFile")}
              </Button>
              <Button variant="outline" className="h-12 gap-2">
                <CloudUpload className="w-4 h-4" />
                {t("bulk.importFromDrive")}
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("bulk.or")}</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("bulk.pasteCsv")}</Label>
              <Textarea
                placeholder={exampleText}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="min-h-[140px] font-mono text-sm bg-secondary/30"
              />
              <Button variant="secondary" className="w-full" disabled={!csvText.trim()}>
                {t("bulk.processPasted")}
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("bulk.cancel")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-6">
            <div className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
              <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
              <p className="font-medium text-lg">{t("bulk.aiDropTitle")}</p>
              <p className="text-sm text-muted-foreground mt-2">{t("bulk.aiDropSubtitle")}</p>
            </div>

            <p className="text-sm text-muted-foreground text-center">{t("bulk.aiDescription")}</p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("bulk.cancel")}
              </Button>
              <Button variant="add" className="gap-2">
                <Sparkles className="w-4 h-4" />
                {t("bulk.aiProcess")}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
