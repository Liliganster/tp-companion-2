import * as React from "react";
import { toast as sonnerToast } from "sonner";

type ToastVariant = "default" | "destructive";

type ToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
};

function normalizeMessage(input: ToastInput): { message: React.ReactNode; description?: React.ReactNode } {
  const hasTitle = input.title !== undefined && input.title !== null && String(input.title).trim() !== "";
  const hasDescription = input.description !== undefined && input.description !== null && String(input.description).trim() !== "";

  if (hasTitle) return { message: input.title!, description: input.description };
  if (hasDescription) return { message: input.description! };
  return { message: "OK" };
}

function toast({ title, description, variant }: ToastInput) {
  const { message, description: desc } = normalizeMessage({ title, description, variant });

  const id =
    variant === "destructive"
      ? sonnerToast.error(message, { description: desc })
      : sonnerToast(message as any, { description: desc });

  return {
    id: String(id),
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: ToastInput) => {
      const normalized = normalizeMessage(next);
      if (next.variant === "destructive") {
        sonnerToast.error(normalized.message, { id, description: normalized.description });
      } else {
        sonnerToast(normalized.message as any, { id, description: normalized.description });
      }
    },
  };
}

function useToast() {
  return React.useMemo(
    () => ({
      toast,
      dismiss: (toastId?: string) => sonnerToast.dismiss(toastId),
      toasts: [],
    }),
    [],
  );
}

export { useToast, toast };

