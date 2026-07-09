/**
 * El informe PDF — Fase 3 del PLAN.md ("el informe del que se presume").
 *
 * ÚNICA implementación del PDF (antes vivía duplicada dos veces dentro de
 * ReportView.tsx). El PDF es el producto visible y el vector de marketing:
 * cabecera freelancer/producción, tabla de viajes (fecha, ruta, propósito,
 * km, tarifa, importe), gastos con nota de anexo, total destacado, línea de
 * CO2 con fuente citada + árboles, firma y pie "Erstellt mit Fahrtenbuch Pro".
 *
 * Idioma independiente de la UI (la Aufnahmeleitung lee alemán; la dueña usa
 * la app en español): se pasa `lang` y las cadenas salen de i18n.
 *
 * Nota tipográfica: jsPDF con Helvetica estándar solo cubre WinAnsi — nada de
 * "₂" ni "→" en las cadenas del PDF (por eso "CO2" y ">").
 */
import type { jsPDF } from "jspdf";
import { getLocale, loadLanguage, t as tLang, tf as tfLang, type AppLanguage, type I18nKey } from "@/lib/i18n";
import { GRID_FACTORS_YEAR, TREE_KG_CO2_PER_YEAR } from "@/lib/emissionFactors";

export type ReportPdfTripRow = {
  date: string;
  routeText: string;
  purpose: string;
  passengers: number;
  distanceKm: number;
  ratePerKm: number;
  amount: number;
};

export type ReportPdfExpenseRow = {
  date: string;
  kind: "toll" | "parking" | "fuel" | "other";
  amount: number;
};

export type ReportPdfData = {
  lang: AppLanguage;
  period: string;
  driver: string;
  address: string;
  licensePlate: string;
  projectLabel: string;
  /** Productora del proyecto (vacío si el informe cruza proyectos). */
  producer: string;
  passengerSurcharge: number;
  trips: ReportPdfTripRow[];
  expenses: ReportPdfExpenseRow[];
  /** Suma de CO2 de los viajes, en kg (0 → no se imprime la línea). */
  co2Kg: number;
  /** ¿Hay recibos adjuntos? → nota "Belege im Anhang (ZIP-Export)". */
  hasReceipts: boolean;
};

const PAGE_MARGIN = 48;
const FOOTER_ZONE = 64; // reserva inferior para el pie de página

export async function buildReportPdf(data: ReportPdfData): Promise<jsPDF> {
  await loadLanguage(data.lang);
  const { jsPDF: JsPdf } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const t = (key: I18nKey) => tLang(data.lang, key);
  const tf = (key: I18nKey, params: Record<string, string | number>) => tfLang(data.lang, key, params);

  const locale = getLocale(data.lang);
  const nf1 = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const km = (v: number) => `${nf1.format(v)} km`;
  const eur = (v: number) => `${nf2.format(v)} €`;

  const doc = new JsPdf({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const rightEdge = pageWidth - PAGE_MARGIN;
  const availableWidth = pageWidth - PAGE_MARGIN * 2;

  const ensureSpace = (y: number, needed: number) => {
    if (y + needed <= pageHeight - FOOTER_ZONE) return y;
    doc.addPage();
    return PAGE_MARGIN + 8;
  };

  // ── Cabecera ───────────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(t("reportPdf.title").toUpperCase(), PAGE_MARGIN, 62);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`${t("reportView.periodLabel")}: ${data.period}`, PAGE_MARGIN, 78);
  doc.setTextColor(0, 0, 0);

  // Dos bloques: freelancer (izquierda) · producción/abrechnung (derecha)
  const drawPair = (x: number, y: number, label: string, value: string, alignRight = false) => {
    doc.setFontSize(9);
    if (alignRight) {
      doc.setFont("helvetica", "normal");
      const full = `${label}: ${value}`;
      const startX = rightEdge - doc.getTextWidth(full);
      doc.setFont("helvetica", "bold");
      doc.text(`${label}: `, startX, y);
      const lw = doc.getTextWidth(`${label}: `);
      doc.setFont("helvetica", "normal");
      doc.text(value, startX + lw, y);
      return;
    }
    doc.setFont("helvetica", "bold");
    doc.text(`${label}: `, x, y);
    const lw = doc.getTextWidth(`${label}: `);
    doc.setFont("helvetica", "normal");
    doc.text(value, x + lw, y);
  };

  const metaY = [98, 112, 126];
  drawPair(PAGE_MARGIN, metaY[0], t("reportView.driverLabel"), data.driver || "—");
  drawPair(PAGE_MARGIN, metaY[1], t("reportView.addressLabel"), data.address || "—");
  drawPair(PAGE_MARGIN, metaY[2], t("reportView.licensePlateLabel"), data.licensePlate || "—");

  drawPair(0, metaY[0], t("reportView.projectLabel"), data.projectLabel || "—", true);
  drawPair(0, metaY[1], t("bulk.producerLabel"), data.producer || "—", true);
  if (data.passengerSurcharge > 0) {
    drawPair(0, metaY[2], t("reportView.passengerSurchargeLabel"), eur(data.passengerSurcharge), true);
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN, 140, rightEdge, 140);

  // ── Tabla de viajes: fecha · ruta · propósito · (mitf.) · km · €/km · importe
  const showPassengers = data.trips.some((trip) => trip.passengers > 0);

  const head: string[] = [
    t("reportView.colDate"),
    t("reportView.colRoute"),
    t("reportPdf.colPurpose"),
    ...(showPassengers ? [t("reportView.colPassengersShort")] : []),
    "km",
    t("reportPdf.colRate"),
    t("reportPdf.colAmount"),
  ];

  const body = data.trips.map((trip) => [
    trip.date,
    trip.routeText,
    trip.purpose,
    ...(showPassengers ? [String(trip.passengers)] : []),
    nf1.format(trip.distanceKm),
    nf2.format(trip.ratePerKm),
    eur(trip.amount),
  ]);

  const fixed = { date: 54, purpose: 82, passengers: 30, km: 42, rate: 38, amount: 62 };
  const routeWidth =
    availableWidth - fixed.date - fixed.purpose - (showPassengers ? fixed.passengers : 0) - fixed.km - fixed.rate - fixed.amount;
  const colStyles: Record<number, any> = showPassengers
    ? {
        0: { cellWidth: fixed.date },
        1: { cellWidth: routeWidth, overflow: "linebreak" },
        2: { cellWidth: fixed.purpose, overflow: "linebreak" },
        3: { cellWidth: fixed.passengers, halign: "center" },
        4: { cellWidth: fixed.km, halign: "right" },
        5: { cellWidth: fixed.rate, halign: "right" },
        6: { cellWidth: fixed.amount, halign: "right" },
      }
    : {
        0: { cellWidth: fixed.date },
        1: { cellWidth: routeWidth, overflow: "linebreak" },
        2: { cellWidth: fixed.purpose, overflow: "linebreak" },
        3: { cellWidth: fixed.km, halign: "right" },
        4: { cellWidth: fixed.rate, halign: "right" },
        5: { cellWidth: fixed.amount, halign: "right" },
      };

  const tableStyles = {
    styles: {
      font: "helvetica" as const,
      fontSize: 8.5,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      textColor: [0, 0, 0] as [number, number, number],
      valign: "top" as const,
      overflow: "linebreak" as const,
      lineWidth: { bottom: 0.3 },
      lineColor: [222, 222, 222] as [number, number, number],
    },
    headStyles: {
      font: "helvetica" as const,
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: 8.5,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      lineWidth: { bottom: 0.8 },
      lineColor: [0, 0, 0] as [number, number, number],
    },
  };

  autoTable(doc, {
    head: [head],
    body,
    startY: 152,
    theme: "plain",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: FOOTER_ZONE },
    columnStyles: colStyles,
    ...tableStyles,
  });

  let y = ((doc as any).lastAutoTable?.finalY ?? 152) + 16;

  // ── Gastos (solo si hay) ───────────────────────────────────────────────────
  const expensesTotal = data.expenses.reduce((acc, e) => acc + e.amount, 0);
  if (data.expenses.length > 0 && expensesTotal > 0) {
    y = ensureSpace(y, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(t("reportPdf.expensesTitle"), PAGE_MARGIN, y);
    const kindLabel: Record<ReportPdfExpenseRow["kind"], string> = {
      toll: t("reportPdf.expenseToll"),
      parking: t("reportPdf.expenseParking"),
      fuel: t("reportPdf.expenseFuel"),
      other: t("reportPdf.expenseOther"),
    };
    autoTable(doc, {
      head: [[t("reportView.colDate"), t("reportPdf.expensesTitle"), t("reportPdf.colAmount")]],
      body: data.expenses.map((e) => [e.date, kindLabel[e.kind], eur(e.amount)]),
      startY: y + 8,
      theme: "plain",
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: FOOTER_ZONE },
      tableWidth: 280,
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 130 },
        2: { cellWidth: 80, halign: "right" },
      },
      ...tableStyles,
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
    if (data.hasReceipts) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text(t("reportPdf.receiptsAnnex"), PAGE_MARGIN, y);
      doc.setTextColor(0, 0, 0);
      y += 14;
    } else {
      y += 6;
    }
  }

  // ── Totales (bloque derecho, total destacado) ──────────────────────────────
  const totalKm = data.trips.reduce((acc, trip) => acc + trip.distanceKm, 0);
  const travelTotal = data.trips.reduce((acc, trip) => acc + trip.amount, 0);
  const grandTotal = travelTotal + expensesTotal;

  y = ensureSpace(y, 96);
  const lineRight = (text: string, yy: number, size = 9.5, bold = false, gray = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(gray ? 110 : 0, gray ? 110 : 0, gray ? 110 : 0);
    doc.text(text, rightEdge, yy, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  lineRight(`${t("reportPdf.tripsLabel")}: ${data.trips.length}   ·   ${t("reportPdf.totalKmLabel")}: ${km(totalKm)}`, y, 9, false, true);
  y += 16;
  lineRight(`${t("reportPdf.travelCosts")}: ${eur(travelTotal)}`, y);
  y += 15;
  if (expensesTotal > 0) {
    lineRight(`${t("reportPdf.expensesTitle")}: ${eur(expensesTotal)}`, y);
    y += 15;
  }

  // Total destacado: caja negra con texto blanco, alineada a la derecha.
  const totalText = `${t("reportPdf.grandTotal")}:  ${eur(grandTotal)}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const boxPadX = 14;
  const boxW = doc.getTextWidth(totalText) + boxPadX * 2;
  const boxH = 26;
  y = ensureSpace(y, boxH + 8);
  doc.setFillColor(17, 17, 17);
  doc.roundedRect(rightEdge - boxW, y - 4, boxW, boxH, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(totalText, rightEdge - boxPadX, y + 13, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += boxH + 18;

  // ── CO2 con fuente citada + árboles equivalentes ───────────────────────────
  if (data.co2Kg > 0) {
    y = ensureSpace(y, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(
      tf("reportPdf.co2Line", { kg: nf1.format(data.co2Kg), trees: nf1.format(data.co2Kg / TREE_KG_CO2_PER_YEAR) }),
      PAGE_MARGIN,
      y,
    );
    y += 11;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(tf("reportPdf.co2Source", { year: GRID_FACTORS_YEAR, treeKg: TREE_KG_CO2_PER_YEAR }), PAGE_MARGIN, y);
    doc.setTextColor(0, 0, 0);
    y += 20;
  }

  // ── Firma ──────────────────────────────────────────────────────────────────
  y = ensureSpace(y, 56);
  y += 26;
  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.6);
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + 190, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(t("reportPdf.signature"), PAGE_MARGIN, y + 11);
  doc.setTextColor(0, 0, 0);

  // ── Pie de página en TODAS las páginas (bucle viral, discreto) ─────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(165, 165, 165);
    doc.text(t("reportPdf.footer"), pageWidth / 2, pageHeight - 28, { align: "center" });
    doc.text(tf("reportPdf.pageOf", { page: i, pages }), rightEdge, pageHeight - 28, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}
