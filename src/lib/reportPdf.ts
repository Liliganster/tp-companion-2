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

export type ReportPdfTripRow = {
  date: string;
  routeText: string;
  purpose: string;
  passengers: number;
  distanceKm: number;
  ratePerKm: number;
  amount: number;
  /** CO2 del viaje en kg — solo se usa si showCo2 (columna opcional). */
  co2Kg?: number | null;
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
  /** Tarifa por km del perfil (la efectiva por viaje va en la columna €/km). */
  ratePerKm?: number;
  passengerSurcharge: number;
  trips: ReportPdfTripRow[];
  expenses: ReportPdfExpenseRow[];
  /** Suma de CO2 de los viajes, en kg (0 → no se imprime la línea). */
  co2Kg: number;
  /** ¿Hay recibos adjuntos? → nota "Belege im Anhang (ZIP-Export)". */
  hasReceipts: boolean;
  /** Bloques OPCIONALES del informe — el usuario los elige antes de exportar.
      CO2 = columna de la tabla + total en la línea de estadísticas (v4:
      árboles y fuente FUERA del informe, no son material de Finanzamt).
      Por defecto activos (compatibilidad). */
  showCo2?: boolean;
  showSignature?: boolean;
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

  // Solo campos CON valor: los "—" de relleno daban aspecto de borrador (v4).
  const hasValue = (v: string) => Boolean(v && v.trim() && v.trim() !== "—");
  const leftMeta: Array<[string, string]> = (
    [
      [t("reportView.driverLabel"), data.driver],
      [t("reportView.addressLabel"), data.address],
    ] as Array<[string, string]>
  ).filter(([, v]) => hasValue(v));
  // La matrícula SIEMPRE sale (pedido 2026-07-11): producción la espera;
  // vacía se marca con raya para completar a mano.
  leftMeta.push([t("reportView.licensePlateLabel"), data.licensePlate?.trim() || "—"]);
  const rightMeta: Array<[string, string]> = (
    [
      [t("reportView.projectLabel"), data.projectLabel],
      [t("bulk.producerLabel"), data.producer],
      // Tarifa base del Kilometergeld (faltaba: solo salía la de pasajeros)
      ...(typeof data.ratePerKm === "number" && data.ratePerKm > 0
        ? ([[t("reportView.ratePerKmLabel"), eur(data.ratePerKm)]] as Array<[string, string]>)
        : []),
      ...(data.passengerSurcharge > 0
        ? ([[t("reportView.passengerSurchargeLabel"), eur(data.passengerSurcharge)]] as Array<[string, string]>)
        : []),
    ] as Array<[string, string]>
  ).filter(([, v]) => hasValue(v));

  leftMeta.forEach(([label, value], i) => drawPair(PAGE_MARGIN, 98 + i * 14, label, value));
  rightMeta.forEach(([label, value], i) => drawPair(0, 98 + i * 14, label, value, true));

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN, 140, rightEdge, 140);

  // ── Tabla de viajes: fecha · ruta · propósito · (mitf.) · km · (CO2) · €/km · importe
  // Columnas DINÁMICAS: Mitf. solo si hay pasajeros; CO2 solo si el usuario
  // lo activa (v4: el CO2 vive EN la tabla, no como nota suelta).
  const showPassengers = data.trips.some((trip) => trip.passengers > 0);
  const showCo2 = data.showCo2 ?? true;
  const showSignature = data.showSignature ?? true;

  type PdfCol = {
    head: string;
    width?: number;
    halign?: "center" | "right";
    wrap?: boolean;
    cell: (trip: ReportPdfTripRow) => string;
    /** Celda de la fila de TOTALES (v8: los totales viven en la tabla). */
    foot?: string;
  };
  const totalKmTable = data.trips.reduce((acc, trip) => acc + trip.distanceKm, 0);
  const totalAmountTable = data.trips.reduce((acc, trip) => acc + trip.amount, 0);
  const tripsCountText =
    data.trips.length === 1 ? t("reportView.tripsCountOne") : tf("reportView.tripsCount", { count: data.trips.length });
  const tripsCountLabel = `${t("reportView.totalShort")} (${tripsCountText})`;

  const columns: PdfCol[] = [
    { head: t("reportView.colDate"), width: 54, cell: (r) => r.date },
    { head: t("reportView.colRoute"), wrap: true, cell: (r) => r.routeText, foot: tripsCountLabel },
    { head: t("reportPdf.colPurpose"), width: 78, wrap: true, cell: (r) => r.purpose },
    ...(showPassengers
      ? [{ head: t("reportView.colPassengersShort"), width: 36, halign: "center", cell: (r) => String(r.passengers || "") } as PdfCol]
      : []),
    // Totales sin unidad: la unidad ya está en la cabecera de la columna
    // ("40,0 km" no cabía y partía en dos líneas).
    { head: "km", width: 40, halign: "right", cell: (r) => nf1.format(r.distanceKm), foot: nf1.format(totalKmTable) },
    ...(showCo2
      ? [{ head: t("reportPdf.colCo2"), width: 54, halign: "right", cell: (r) => nf1.format(r.co2Kg ?? 0), foot: nf1.format(data.co2Kg) } as PdfCol]
      : []),
    { head: t("reportPdf.colRate"), width: 36, halign: "right", cell: (r) => nf2.format(r.ratePerKm) },
    { head: t("reportPdf.colAmount"), width: 58, halign: "right", cell: (r) => eur(r.amount), foot: eur(totalAmountTable) },
  ];

  const head: string[] = columns.map((c) => c.head);
  const body = data.trips.map((trip) => columns.map((c) => c.cell(trip)));
  const foot: string[] = columns.map((c) => c.foot ?? "");

  const fixedSum = columns.reduce((acc, c) => acc + (c.width ?? 0), 0);
  const routeWidth = availableWidth - fixedSum;
  const colStyles: Record<number, any> = {};
  columns.forEach((c, i) => {
    colStyles[i] = {
      cellWidth: c.width ?? routeWidth,
      ...(c.halign ? { halign: c.halign } : {}),
      ...(c.wrap ? { overflow: "linebreak" } : {}),
    };
  });

  // Cabeceras y TOTALES heredan la alineación de su columna: un título a la
  // izquierda sobre números a la derecha hacía que las cifras parecieran
  // solapadas con la columna vecina. La etiqueta "Total (N viajes)" (columna
  // ruta) se alinea a la derecha para arrimarse a las cifras.
  const routeColIndex = 1;
  const alignHeadWithColumn = (hookData: any) => {
    if (hookData.section === "head" || hookData.section === "foot") {
      const st = colStyles[hookData.column.index];
      if (st?.halign) hookData.cell.styles.halign = st.halign;
      if (hookData.section === "foot" && hookData.column.index === routeColIndex) {
        hookData.cell.styles.halign = "right";
      }
    }
  };

  const tableStyles = {
    styles: {
      font: "helvetica" as const,
      fontSize: 8.5,
      cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
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
      cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
      lineWidth: { bottom: 0.8 },
      lineColor: [0, 0, 0] as [number, number, number],
    },
    footStyles: {
      font: "helvetica" as const,
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: 8.5,
      cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
      lineWidth: { top: 0.8 },
      lineColor: [0, 0, 0] as [number, number, number],
    },
  };

  autoTable(doc, {
    head: [head],
    body,
    foot: [foot],
    showFoot: "lastPage",
    startY: 152,
    theme: "plain",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: FOOTER_ZONE },
    columnStyles: colStyles,
    didParseCell: alignHeadWithColumn,
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
  // Decisión de la propietaria: el importe del viaje es SOLO kilometraje; el
  // suplemento por pasajeros va como línea separada (los pasajeros por viaje
  // ya están en la tabla — producción/Finanzamt lo interpretan).
  const travelTotal = data.trips.reduce((acc, trip) => acc + trip.amount, 0);
  const totalPassengers = data.trips.reduce((acc, trip) => acc + trip.passengers, 0);
  const passengerTotal = totalPassengers * data.passengerSurcharge;
  const grandTotal = travelTotal + passengerTotal + expensesTotal;

  y = ensureSpace(y, 96);
  const lineRight = (text: string, yy: number, size = 9.5, bold = false, gray = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(gray ? 110 : 0, gray ? 110 : 0, gray ? 110 : 0);
    doc.text(text, rightEdge, yy, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  // v8: sin línea de estadísticas — viajes, km y CO2 viven en la fila de
  // totales DE la tabla. Estilo factura: el desglose SOLO cuando hay más de
  // un componente; con solo kilometraje iría el mismo importe dos veces.
  if (passengerTotal > 0 || expensesTotal > 0) {
    lineRight(`${t("reportPdf.travelCosts")}: ${eur(travelTotal)}`, y);
    y += 15;
    if (passengerTotal > 0) {
      lineRight(`${t("reportView.passengerSurchargeLabel")} (${totalPassengers}): ${eur(passengerTotal)}`, y);
      y += 15;
    }
    if (expensesTotal > 0) {
      lineRight(`${t("reportPdf.expensesTitle")}: ${eur(expensesTotal)}`, y);
      y += 15;
    }
  }

  // Total — sobrio (2ª iteración 2026-07-10): UNA regla fina y la cifra en
  // negrita a tamaño proporcionado. Ni caja negra ni doble subrayado.
  const totalText = `${t("reportPdf.grandTotal")}: ${eur(grandTotal)}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  y = ensureSpace(y, 60);
  y += 16; // aire antes del total (2026-07-11: quedaba pegado al desglose)
  doc.setDrawColor(70, 70, 70);
  doc.setLineWidth(0.8);
  doc.line(rightEdge - 220, y, rightEdge, y);
  doc.setTextColor(0, 0, 0);
  doc.text(totalText, rightEdge, y + 18, { align: "right" });
  y += 42;

  // ── Firma (opcional): con aire generoso respecto al bloque de totales
  //    (queja 2026-07-11: quedaba muy junta) ────────────────────────────────
  if (showSignature) {
    y = ensureSpace(y, 130);
    y += 96;
    doc.setDrawColor(90, 90, 90);
    doc.setLineWidth(0.6);
    doc.line(PAGE_MARGIN, y, PAGE_MARGIN + 190, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(t("reportPdf.signature"), PAGE_MARGIN, y + 11);
    doc.setTextColor(0, 0, 0);
  }

  // ── Pie "Creado con Fahrtenbuch Pro" en TODAS las páginas ──────────────────
  // Obligatorio y legible (antes salía tan claro que parecía no estar).
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(115, 115, 115);
    doc.text(t("reportPdf.footer"), pageWidth / 2, pageHeight - 28, { align: "center" });
    doc.text(tf("reportPdf.pageOf", { page: i, pages }), rightEdge, pageHeight - 28, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}
