/**
 * Color determinista por proyecto (paleta Unity) para las etiquetas de
 * proyecto en tablas y tarjetas: el mismo nombre siempre recibe el mismo
 * color, sin estado ni configuración.
 */
export const PROJECT_LABEL_COLORS: Array<{ bg: string; fg: string }> = [
  { bg: "#3F8CFF", fg: "#FFFFFF" }, // azul (acento)
  { bg: "#7FBA7A", fg: "#10241B" }, // verde
  { bg: "#6C5DD3", fg: "#FFFFFF" }, // morado
  { bg: "#FFCE73", fg: "#3A2A00" }, // amarillo
  { bg: "#FF754C", fg: "#FFFFFF" }, // naranja
  { bg: "#A0D7E7", fg: "#0F2A33" }, // cian
];

export function projectLabelColor(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PROJECT_LABEL_COLORS[Math.abs(hash) % PROJECT_LABEL_COLORS.length];
}
