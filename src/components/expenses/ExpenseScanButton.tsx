import { useCallback, useRef, useState, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Loader2, RotateCw, Check, X, AlertCircle, Upload, ImageIcon, Trash2, FileText } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useI18n } from "@/hooks/use-i18n";
import { cn, uuidv4 } from "@/lib/utils";

export type ExpenseType = "toll" | "parking" | "fuel" | "other";

interface ExpenseExtractResult {
  amount: number | null;
  currency: string | null;
  // Fuel-specific
  quantity: number | null;
  unit: string | null;
  pricePerUnit: number | null;
  // Metadata
  vendorName: string | null;
  date: string | null;
}

interface ExpenseScanButtonProps {
  expenseType: ExpenseType;
  onExtracted: (result: ExpenseExtractResult, storagePath: string) => void;
  onDeleted?: () => void;
  existingReceiptPath?: string | null;
  disabled?: boolean;
  className?: string;
  tripId?: string;
  projectId?: string;
}

// Compress and resize image client-side
async function compressImage(file: File, maxWidth = 1600, quality = 0.75): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      // Calculate new dimensions
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to compress image"));
        },
        "image/webp",
        quality
      );
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

// Rotate image 90 degrees
async function rotateImage(imageUrl: string, degrees: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      // Swap dimensions for 90/270 degree rotation
      const isRotated = degrees === 90 || degrees === 270;
      canvas.width = isRotated ? img.height : img.width;
      canvas.height = isRotated ? img.width : img.height;

      ctx?.translate(canvas.width / 2, canvas.height / 2);
      ctx?.rotate((degrees * Math.PI) / 180);
      ctx?.drawImage(img, -img.width / 2, -img.height / 2);

      resolve(canvas.toDataURL("image/webp", 0.85));
    };

    img.onerror = () => reject(new Error("Failed to rotate image"));
    img.src = imageUrl;
  });
}

export function ExpenseScanButton({
  expenseType,
  onExtracted,
  onDeleted,
  existingReceiptPath,
  disabled,
  className,
  tripId,
  projectId,
}: ExpenseScanButtonProps) {
  const { t } = useI18n();
  const { user, getAccessToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExpenseExtractResult | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setImagePreview(null);
    setRotation(0);
    setIsProcessing(false);
    setExtractionResult(null);
    setExtractionError(null);
    setStoragePath(null);
    setIsDragging(false);
  }, []);

  // Delete existing receipt from storage
  const handleDeleteReceipt = useCallback(async () => {
    if (!existingReceiptPath || !supabase) return;

    setIsDeleting(true);
    try {
      // Delete from Supabase Storage
      const { error } = await supabase.storage
        .from("project_documents")
        .remove([existingReceiptPath]);

      if (error) throw error;

      toast.success(t("expenseScan.receiptDeleted"));
      onDeleted?.();
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(t("expenseScan.deleteError"));
    } finally {
      setIsDeleting(false);
    }
  }, [existingReceiptPath, onDeleted, t]);

  // Process a file (from input, camera, or drag & drop)
  const processFile = useCallback((file: File) => {
    // Reset previous state
    resetState();

    // Validate file type
    if (!file.type.match(/image\/(jpeg|jpg|png|webp)/)) {
      toast.error(t("expenseScan.invalidFileType"));
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("expenseScan.fileTooLarge"));
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
      setShowUploadOptions(false);
    };
    reader.readAsDataURL(file);
  }, [resetState, t]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input
    e.target.value = "";
  }, [processFile]);

  // Drag & Drop handlers
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleRotate = useCallback(async () => {
    if (!imagePreview) return;

    const newRotation = (rotation + 90) % 360;
    try {
      const rotatedUrl = await rotateImage(imagePreview, 90);
      setImagePreview(rotatedUrl);
      setRotation(newRotation);
    } catch (err) {
      console.error("Rotation error:", err);
    }
  }, [imagePreview, rotation]);

  const handleProcess = useCallback(async () => {
    if (!imagePreview || !user || !supabase) return;

    setIsProcessing(true);
    setExtractionError(null);

    try {
      // Convert data URL to blob
      const response = await fetch(imagePreview);
      const originalBlob = await response.blob();
      const originalFile = new File([originalBlob], "receipt.webp", { type: "image/webp" });

      // Compress image
      const compressedBlob = await compressImage(originalFile, 1600, 0.75);

      // Generate storage path
      const date = new Date();
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const fileName = `${user.id}/${yearMonth}/${uuidv4()}.webp`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("project_documents")
        .upload(fileName, compressedBlob, {
          contentType: "image/webp",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      setStoragePath(fileName);

      // Call extraction API
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");

      const extractResponse = await fetch("/api/expenses/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          storagePath: fileName,
          expenseType,
          tripId,
          projectId,
        }),
      });

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json().catch(() => ({}));
        const status = extractResponse.status;
        
        // Provide user-friendly error messages
        if (status === 401) {
          throw new Error(t("expenseScan.errorNotAuthenticated"));
        } else if (status === 429) {
          throw new Error(t("expenseScan.errorQuotaExceeded"));
        } else if (status === 404) {
          throw new Error(t("expenseScan.errorFileNotFound"));
        } else if (status >= 500) {
          throw new Error(t("expenseScan.errorServer"));
        }
        throw new Error(errorData.error || t("expenseScan.error"));
      }

      const result: ExpenseExtractResult = await extractResponse.json();
      
      // Check if extraction returned useful data
      if (result.amount == null) {
        setExtractionError(t("expenseScan.noDataExtracted"));
        return;
      }
      
      setExtractionResult(result);
    } catch (err: any) {
      console.error("Processing error:", err);
      setExtractionError(err.message || t("expenseScan.error"));
    } finally {
      setIsProcessing(false);
    }
  }, [imagePreview, user, getAccessToken, expenseType, tripId, projectId, t]);

  const handleConfirm = useCallback(() => {
    if (!extractionResult || !storagePath) return;

    onExtracted(extractionResult, storagePath);
    setIsOpen(false);
    setShowUploadOptions(false);
    resetState();
    toast.success(t("expenseScan.extracted"));
  }, [extractionResult, storagePath, onExtracted, resetState, t]);

  const handleCancel = useCallback(() => {
    // If we uploaded but user cancels, optionally delete the file
    // For now, we'll keep it (they might retry)
    setIsOpen(false);
    setShowUploadOptions(false);
    resetState();
  }, [resetState]);

  const getExpenseTypeLabel = useCallback(() => {
    switch (expenseType) {
      case "toll": return t("expenseScan.typeToll");
      case "parking": return t("expenseScan.typeParking");
      case "fuel": return t("expenseScan.typeFuel");
      case "other": 
      default: return t("expenseScan.typeOther");
    }
  }, [expenseType, t]);

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Trigger button - shows different state if receipt exists */}
      {existingReceiptPath ? (
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("h-10 w-10 shrink-0 border-green-500/50 text-green-500", className)}
            disabled={disabled}
            onClick={() => {
              setIsOpen(true);
              setShowUploadOptions(true);
            }}
            title={t("expenseScan.viewReceipt")}
          >
            <FileText className="w-5 h-5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 text-destructive hover:bg-destructive/10"
            disabled={disabled || isDeleting}
            onClick={handleDeleteReceipt}
            title={t("expenseScan.deleteReceipt")}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("h-10 w-10 shrink-0", className)}
          disabled={disabled}
          onClick={() => {
            setIsOpen(true);
            setShowUploadOptions(true);
          }}
          title={t("expenseScan.scanReceipt")}
        >
          <Camera className="w-5 h-5" />
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>{t("expenseScan.title")}</DialogTitle>
            <DialogDescription>
              {getExpenseTypeLabel()}
            </DialogDescription>
          </DialogHeader>

          <div className="px-4 pb-4 space-y-4">
            {/* Upload options - shown when no image is selected */}
            {showUploadOptions && !imagePreview && (
              <div className="space-y-3">
                {/* Drag & Drop zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors",
                    "flex flex-col items-center justify-center gap-3 text-center",
                    isDragging 
                      ? "border-primary bg-primary/10" 
                      : "border-muted-foreground/30 hover:border-primary/50 hover:bg-secondary/30"
                  )}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    isDragging ? "bg-primary/20" : "bg-secondary"
                  )}>
                    <ImageIcon className={cn(
                      "w-6 h-6",
                      isDragging ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {t("expenseScan.dragDropText")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("expenseScan.clickToUpload")}
                    </p>
                  </div>
                </div>

                {/* Action buttons row */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="w-4 h-4" />
                    {t("expenseScan.useCamera")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex items-center gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    {t("expenseScan.uploadFile")}
                  </Button>
                </div>
              </div>
            )}

            {/* Image Preview */}
            {imagePreview && !extractionResult && (
              <div className="relative">
                <div className="aspect-[3/4] bg-secondary/50 rounded-lg overflow-hidden">
                  <img
                    src={imagePreview}
                    alt="Receipt preview"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Rotation button */}
                {!isProcessing && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={handleRotate}
                  >
                    <RotateCw className="w-4 h-4" />
                  </Button>
                )}

                {/* Processing overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">{t("expenseScan.processing")}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error state */}
            {extractionError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">{t("expenseScan.error")}</p>
                    <p className="text-sm text-muted-foreground mt-1">{extractionError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Extraction Result */}
            {extractionResult && (
              <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-500">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">{t("expenseScan.dataExtracted")}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {extractionResult.amount != null && (
                    <div>
                      <span className="text-muted-foreground">{t("expenseScan.amount")}:</span>
                      <span className="ml-2 font-medium">
                        {extractionResult.amount.toFixed(2)} {extractionResult.currency || "EUR"}
                      </span>
                    </div>
                  )}

                  {expenseType === "fuel" && extractionResult.quantity != null && (
                    <>
                      <div>
                        <span className="text-muted-foreground">{t("expenseScan.quantity")}:</span>
                        <span className="ml-2 font-medium">
                          {extractionResult.quantity.toFixed(2)} {extractionResult.unit || "L"}
                        </span>
                      </div>
                      {extractionResult.pricePerUnit != null && (
                        <div>
                          <span className="text-muted-foreground">{t("expenseScan.pricePerUnit")}:</span>
                          <span className="ml-2 font-medium">
                            {extractionResult.pricePerUnit.toFixed(3)} €/L
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {extractionResult.vendorName && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{t("expenseScan.vendor")}:</span>
                      <span className="ml-2">{extractionResult.vendorName}</span>
                    </div>
                  )}

                  {extractionResult.date && (
                    <div>
                      <span className="text-muted-foreground">{t("expenseScan.date")}:</span>
                      <span className="ml-2">{extractionResult.date}</span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {t("expenseScan.canEditAfter")}
                </p>
              </div>
            )}

            {/* Action buttons - only show when image is loaded */}
            {imagePreview && (
              <div className="flex gap-2">
                {!extractionResult ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={handleCancel}
                      disabled={isProcessing}
                    >
                      <X className="w-4 h-4 mr-2" />
                      {t("expenseScan.cancel")}
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={handleProcess}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      {t("expenseScan.extract")}
                    </Button>
                  </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setExtractionResult(null);
                      setExtractionError(null);
                    }}
                  >
                    {t("expenseScan.retry")}
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={handleConfirm}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {t("expenseScan.useData")}
                  </Button>
                </>
              )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
