export type BulkAiStep = "upload" | "processing" | "review";

export type BulkCloseJobState = {
  status?: string | null;
};

type GetBulkCloseCancellationArgs = {
  activeJobIds: string[];
  aiLoading: boolean;
  aiStep: BulkAiStep;
  jobIds: string[];
  jobStateById: Record<string, BulkCloseJobState>;
};

/**
 * Qué hacer con los jobs de la sesión cuando se cierra el modal.
 *
 * Regla: cerrar el modal NUNCA destruye trabajo de IA ya en marcha o terminado.
 * - `created`/`queued` (aún no consumen IA) y `failed` → se cancelan y limpian.
 * - `processing`/`done` → siguen su curso en el servidor; al reabrir el modal
 *   se recuperan para revisión (resurrección).
 */
export function getBulkCloseCancellation(args: GetBulkCloseCancellationArgs) {
  const { activeJobIds, aiLoading, aiStep, jobIds, jobStateById } = args;
  const sessionJobIds = Array.from(new Set([...jobIds, ...activeJobIds])).filter(Boolean);
  const closeWhileProcessing = aiLoading || aiStep === "processing";

  const jobsToCancel = sessionJobIds.filter((id) => {
    const status = String(jobStateById[id]?.status ?? "").trim();
    // Sin estado conocido: solo es seguro cancelarlo mientras se está subiendo
    // (jobs "created" de esta sesión que aún no llegaron a la cola).
    if (!status) return aiLoading;
    return status === "created" || status === "queued" || status === "failed";
  });

  const backgroundJobIds = sessionJobIds.filter((id) => {
    const status = String(jobStateById[id]?.status ?? "").trim();
    return status === "processing" || (closeWhileProcessing && status === "done");
  });

  return {
    jobsToCancel,
    /** Jobs que siguen vivos en el servidor tras cerrar (se avisa al usuario). */
    backgroundJobIds,
    shouldShowCancellationToast: jobsToCancel.length > 0,
    shouldShowBackgroundToast: backgroundJobIds.length > 0,
  };
}
