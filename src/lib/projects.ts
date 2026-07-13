/**
 * Busca un proyecto compatible con un nombre extraído por la IA.
 * Exacto primero; si no, contención mutua (proyecto "rex" acepta
 * "KOMMISSAR REX" y viceversa) — mismo criterio que el guardián de
 * project-mismatch de la base de datos. Mínimo 3 caracteres para contener.
 */
export function findProjectByCompatibleName<T extends { id: string; name: string }>(
  projects: T[],
  extractedName: string,
): T | undefined {
  const target = String(extractedName ?? "").trim().toLowerCase();
  if (!target) return undefined;

  const exact = projects.find((p) => p.name.trim().toLowerCase() === target);
  if (exact) return exact;

  return projects.find((p) => {
    const name = p.name.trim().toLowerCase();
    if (name.length < 3 && target.length < 3) return false;
    return (name.length >= 3 && target.includes(name)) || (target.length >= 3 && name.includes(target));
  });
}
