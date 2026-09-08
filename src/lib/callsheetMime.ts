/**
 * Tipos de archivo aceptados como callsheet — Fase 2 del PLAN.md.
 *
 * Caso real frecuente: la dispo llega como foto de WhatsApp (JPG/PNG), no
 * como PDF. Gemini lee imágenes nativamente, así que el pipeline solo
 * necesita el mime correcto y saltarse la extracción de texto del PDF.
 * Compartido entre los uploaders (cliente) y los workers (api/).
 */

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const SUPPORTED_MIMES = new Set(Object.values(EXTENSION_TO_MIME));

/** Valor para el atributo `accept` de los inputs de subida de callsheets. */
export const CALLSHEET_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(String(name ?? "").trim());
  return match ? match[1].toLowerCase() : "";
}

/**
 * Mime real de un callsheet a partir de su ruta en storage (la extensión del
 * nombre original se conserva al subir). Jobs antiguos son siempre PDF, por
 * eso el fallback.
 */
export function resolveCallsheetMime(storagePath: string, fallbackType?: string | null): string {
  const byExtension = EXTENSION_TO_MIME[extensionOf(storagePath)];
  if (byExtension) return byExtension;
  const fallback = String(fallbackType ?? "").trim().toLowerCase();
  if (SUPPORTED_MIMES.has(fallback)) return fallback;
  return "application/pdf";
}

/** ¿El archivo elegido es un callsheet procesable (PDF o imagen soportada)? */
export function isSupportedCallsheetFile(file: { type?: string | null; name?: string | null }): boolean {
  const type = String(file?.type ?? "").trim().toLowerCase();
  if (type) return SUPPORTED_MIMES.has(type);
  // Algunos drag&drop no traen mime: decide la extensión.
  return Boolean(EXTENSION_TO_MIME[extensionOf(String(file?.name ?? ""))]);
}

export function isImageCallsheetMime(mime: string): boolean {
  return String(mime ?? "").trim().toLowerCase().startsWith("image/");
}
