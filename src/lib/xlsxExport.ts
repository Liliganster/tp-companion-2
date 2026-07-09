/**
 * Export a .xlsx con exceljs — Fase 5 del PLAN.md.
 *
 * Sustituye a `xlsx` (SheetJS 0.18.5), que arrastra CVEs sin parche en npm.
 * exceljs se importa dinámicamente para no engordar el bundle principal.
 */
export async function downloadXlsx(args: {
  fileName: string;
  sheetName: string;
  /** Filas como array de arrays; la primera suele ser la cabecera. */
  rows: Array<Array<string | number>>;
}): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(args.sheetName);
  for (const row of args.rows) worksheet.addRow(row);
  worksheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = args.fileName.endsWith(".xlsx") ? args.fileName : `${args.fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
