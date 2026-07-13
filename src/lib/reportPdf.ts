/**
 * El informe PDF — Fase 3 del PLAN.md ("el informe del que se presume").
 *
 * ÚNICA implementación del PDF (antes vivía duplicada dos veces dentro de
 * ReportView.tsx). El PDF es el producto visible y el vector de marketing:
 * cabecera freelancer/producción, tabla de viajes, gastos con nota de anexo,
 * total destacado, firma y pie "Erstellt mit Fahrtenbuch Pro".
 *
 * v9 (2026-07-12): estilo del mockup de la landing — título + chip de marca,
 * cabeceras de tabla grises en MAYÚSCULAS con reglas segmentadas por columna,
 * propósito como segunda línea de la ruta, importe en negrita y el total en
 * caja negra redondeada (GESAMT) con el resumen km · viajes a la izquierda.
 *
 * Idioma independiente de la UI (la Aufnahmeleitung lee alemán; la dueña usa
 * la app en español): se pasa `lang` y las cadenas salen de i18n.
 *
 * Nota tipográfica: jsPDF con Helvetica estándar solo cubre WinAnsi — nada de
 * "₂" ni "→" en las cadenas del PDF (por eso "CO2" y ">").
 */
import type { jsPDF } from "jspdf";
import { getLocale, loadLanguage, t as tLang, tf as tfLang, type AppLanguage, type I18nKey } from "@/lib/i18n";

const ALL_LANGS: AppLanguage[] = ["es", "en", "de"];

/**
 * Reescribe un propósito AUTOGENERADO ("Rodaje/Dreh/Shoot" ± productora),
 * detectado en cualquier idioma, al idioma del informe. Los propósitos se
 * guardan en el idioma que tenía la app al procesar la callsheet, lo que
 * mezclaba idiomas en el PDF. Un propósito escrito a mano por el usuario no
 * coincide con las plantillas y se devuelve intacto.
 */
function localizeAutoPurpose(purpose: string, lang: AppLanguage): string {
  const raw = (purpose ?? "").trim();
  if (!raw) return "";
  for (const src of ALL_LANGS) {
    if (raw.toLowerCase() === tLang(src, "bulk.purposeDefault").trim().toLowerCase()) {
      return tLang(lang, "bulk.purposeDefault");
    }
    const prefix = tLang(src, "bulk.purposeWithProducer").split("{producer}")[0].trim(); // "Rodaje:"
    if (prefix && raw.toLowerCase().startsWith(prefix.toLowerCase())) {
      const producer = raw.slice(prefix.length).replace(/^[:\s]+/, "").trim();
      return tfLang(lang, "bulk.purposeWithProducer", { producer });
    }
  }
  return raw;
}

/** "Todos los proyectos" guardado en la interfaz → idioma del informe. */
function localizeAllProjects(label: string, lang: AppLanguage): string {
  const raw = (label ?? "").trim();
  if (!raw) return label;
  for (const src of ALL_LANGS) {
    if (raw.toLowerCase() === tLang(src, "reports.allProjects").trim().toLowerCase()) {
      return tLang(lang, "reports.allProjects");
    }
  }
  return label;
}

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

const PAGE_MARGIN = 34; // márgenes ajustados para que la tabla quepa holgada
const FOOTER_ZONE = 64; // reserva inferior para el pie de página

export async function buildReportPdf(data: ReportPdfData): Promise<jsPDF> {
  // Los tres idiomas cargados: el PDF sale en data.lang, pero necesitamos leer
  // las plantillas de TODOS para detectar textos autogenerados (propósito,
  // "todos los proyectos") guardados en el idioma que tuviera la app entonces.
  await Promise.all(ALL_LANGS.map((l) => loadLanguage(l).catch(() => {})));
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

  // ── Cabecera (v10, 2026-07-12): título grande + dos líneas grises (periodo ·
  //    conductor / proyecto · productora) y los datos restantes como pares
  //    etiqueta:valor. SIN chip de marca (pedido: cabecera sobria). El pie
  //    "Erstellt mit Fahrtenbuch Pro" sigue en todas las páginas. ────────────
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(t("reportPdf.title"), PAGE_MARGIN, 64);

  // Solo campos CON valor: los "—" de relleno daban aspecto de borrador (v4).
  const hasValue = (v: string) => Boolean(v && v.trim() && v.trim() !== "—");

  // Proyecto en el idioma del informe: "Todos los proyectos" guardado en la
  // interfaz (ES) se reescribe a "Alle Projekte" si el PDF es alemán.
  const projectLabel = localizeAllProjects(data.projectLabel, data.lang);

  // Subtítulos grises: periodo · conductor / proyecto · productora
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(122, 124, 135);
  doc.text([data.period, ...(hasValue(data.driver) ? [data.driver] : [])].join(" · "), PAGE_MARGIN, 84);
  let headerY = 84;
  const subtitle2 = [
    ...(hasValue(projectLabel) ? [`${t("reportView.projectLabel")}: ${projectLabel}`] : []),
    ...(hasValue(data.producer) ? [`${t("bulk.producerLabel")}: ${data.producer}`] : []),
  ].join(" · ");
  if (subtitle2) {
    headerY += 14;
    doc.text(subtitle2, PAGE_MARGIN, headerY);
  }
  doc.setTextColor(0, 0, 0);

  // Pares etiqueta:valor restantes — etiqueta gris, valor negro
  const drawPair = (x: number, y: number, label: string, value: string, alignRight = false) => {
    doc.setFontSize(8.5);
    const labelText = `${label}: `;
    doc.setFont("helvetica", "bold");
    const lw = doc.getTextWidth(labelText);
    let startX = x;
    if (alignRight) {
      doc.setFont("helvetica", "normal");
      const vw = doc.getTextWidth(value);
      doc.setFont("helvetica", "bold");
      startX = rightEdge - (lw + vw);
    }
    doc.setTextColor(122, 124, 135);
    doc.text(labelText, startX, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(value, startX + lw, y);
  };

  const leftMeta: Array<[string, string]> = (
    [[t("reportView.addressLabel"), data.address]] as Array<[string, string]>
  ).filter(([, v]) => hasValue(v));
  // La matrícula SIEMPRE sale (pedido 2026-07-11): producción la espera;
  // vacía se marca con raya para completar a mano.
  leftMeta.push([t("reportView.licensePlateLabel"), data.licensePlate?.trim() || "—"]);
  const rightMeta: Array<[string, string]> = (
    [
      // Tarifa base del Kilometergeld (faltaba: solo salía la de pasajeros)
      ...(typeof data.ratePerKm === "number" && data.ratePerKm > 0
        ? ([[t("reportView.ratePerKmLabel"), eur(data.ratePerKm)]] as Array<[string, string]>)
        : []),
      ...(data.passengerSurcharge > 0
        ? ([[t("reportView.passengerSurchargeLabel"), eur(data.passengerSurcharge)]] as Array<[string, string]>)
        : []),
    ] as Array<[string, string]>
  ).filter(([, v]) => hasValue(v));

  const pairsY = headerY + 22;
  leftMeta.forEach(([label, value], i) => drawPair(PAGE_MARGIN, pairsY + i * 13, label, value));
  rightMeta.forEach(([label, value], i) => drawPair(0, pairsY + i * 13, label, value, true));
  const tableStartY = pairsY + Math.max(leftMeta.length, rightMeta.length, 1) * 13 + 10;

  // ── Tabla de viajes (v9, mockup): DATUM · ROUTE · (MITF.) · KM · (CO2) ·
  //    €/KM · BETRAG. El propósito va como segunda línea de la ruta (si no
  //    repite el proyecto que ya está en la cabecera); el importe en negrita.
  //    Mitf. solo si hay pasajeros; CO2 solo si el usuario lo activa. Los
  //    totales viven en la caja GESAMT, no en un pie de tabla.
  const showPassengers = data.trips.some((trip) => trip.passengers > 0);
  const showCo2 = data.showCo2 ?? true;
  const showSignature = data.showSignature ?? true;

  type PdfCol = {
    head: string;
    width?: number;
    halign?: "center" | "right";
    wrap?: boolean;
    bold?: boolean;
    gray?: boolean;
    cell: (trip: ReportPdfTripRow) => string;
  };
  const totalKmTable = data.trips.reduce((acc, trip) => acc + trip.distanceKm, 0);
  const totalAmountTable = data.trips.reduce((acc, trip) => acc + trip.amount, 0);

  const sameAsProject = (purpose: string) =>
    purpose.trim().toLowerCase() === projectLabel.trim().toLowerCase();
  const columns: PdfCol[] = [
    // Ancho suficiente para DD/MM/YYYY sin que la fecha se parta en dos líneas.
    { head: t("reportView.colDate"), width: 62, gray: true, cell: (r) => r.date },
    {
      head: t("reportView.colRoute"),
      wrap: true,
      cell: (r) => {
        // Propósito autogenerado ("Rodaje"→"Dreh"…) reescrito al idioma del PDF.
        const purpose = localizeAutoPurpose(r.purpose, data.lang);
        return purpose && !sameAsProject(purpose) ? `${r.routeText}\n${purpose}` : r.routeText;
      },
    },
    ...(showPassengers
      ? [{ head: t("reportView.colPassengersShort"), width: 38, halign: "center", cell: (r) => String(r.passengers || "") } as PdfCol]
      : []),
    // CO2 va DESPUÉS de ruta y ANTES de km (pedido 2026-07-12).
    ...(showCo2
      ? [{ head: t("reportPdf.colCo2"), width: 54, halign: "right", cell: (r) => nf1.format(r.co2Kg ?? 0) } as PdfCol]
      : []),
    // Totales sin unidad: la unidad ya está en la cabecera de la columna
    // ("40,0 km" no cabía y partía en dos líneas).
    { head: "km", width: 44, halign: "right", cell: (r) => nf1.format(r.distanceKm) },
    { head: t("reportPdf.colRate"), width: 42, halign: "right", cell: (r) => nf2.format(r.ratePerKm) },
    { head: t("reportPdf.colAmount"), width: 66, halign: "right", bold: true, cell: (r) => eur(r.amount) },
  ];

  const head: string[] = columns.map((c) => c.head.toUpperCase());
  const body = data.trips.map((trip) => columns.map((c) => c.cell(trip)));

  const fixedSum = columns.reduce((acc, c) => acc + (c.width ?? 0), 0);
  const routeWidth = availableWidth - fixedSum;
  // Hueco visual entre columnas: padding derecho de cada celda + corte de las
  // reglas segmentadas justo donde empieza (la última columna llega al borde).
  const COL_GAP = 10;
  const colStyles: Record<number, any> = {};
  columns.forEach((c, i) => {
    colStyles[i] = {
      cellWidth: c.width ?? routeWidth,
      cellPadding: { top: 7, bottom: 7, left: 0, right: i === columns.length - 1 ? 0 : COL_GAP },
      ...(c.halign ? { halign: c.halign } : {}),
      ...(c.wrap ? { overflow: "linebreak" } : {}),
      ...(c.bold ? { fontStyle: "bold" } : {}),
      ...(c.gray ? { textColor: [122, 124, 135] } : {}),
    };
  });

  // columnStyles solo aplica al cuerpo: las cabeceras heredan alineación y
  // padding de su columna vía didParseCell (números a la derecha).
  const makeHeadStyler = (cs: Record<number, any>, lastIndex: number) => (hookData: any) => {
    if (hookData.section !== "head") return;
    const st = cs[hookData.column.index];
    if (st?.halign) hookData.cell.styles.halign = st.halign;
    if (hookData.column.index === lastIndex) {
      hookData.cell.styles.cellPadding = { top: 4, right: 0, bottom: 6, left: 0 };
    }
  };

  // Reglas segmentadas por columna, como en el mockup: negra bajo la cabecera,
  // gris clara bajo cada fila. autotable no dibuja bordes (lineWidth 0).
  const makeRuleDrawer = (lastIndex: number) => (hookData: any) => {
    const { cell, column, section } = hookData;
    if (section !== "head" && section !== "body") return;
    const x2 = cell.x + cell.width - (column.index === lastIndex ? 0 : COL_GAP);
    const yy = cell.y + cell.height;
    if (section === "head") {
      doc.setDrawColor(17, 18, 20);
      doc.setLineWidth(1);
    } else {
      doc.setDrawColor(229, 230, 233);
      doc.setLineWidth(0.5);
    }
    doc.line(cell.x, yy, x2, yy);
  };

  const tableStyles = {
    styles: {
      font: "helvetica" as const,
      fontSize: 9,
      cellPadding: { top: 7, right: COL_GAP, bottom: 7, left: 0 },
      textColor: [17, 18, 20] as [number, number, number],
      valign: "top" as const,
      overflow: "linebreak" as const,
      lineWidth: 0,
    },
    headStyles: {
      font: "helvetica" as const,
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: [122, 124, 135] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: 7.5,
      cellPadding: { top: 4, right: COL_GAP, bottom: 6, left: 0 },
      lineWidth: 0,
    },
  };

  autoTable(doc, {
    head: [head],
    body,
    startY: tableStartY,
    theme: "plain",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: FOOTER_ZONE },
    columnStyles: colStyles,
    didParseCell: makeHeadStyler(colStyles, columns.length - 1),
    didDrawCell: makeRuleDrawer(columns.length - 1),
    ...tableStyles,
  });

  let y = ((doc as any).lastAutoTable?.finalY ?? tableStartY) + 16;

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
    const expenseColStyles: Record<number, any> = {
      0: { cellWidth: 70, cellPadding: { top: 7, bottom: 7, left: 0, right: COL_GAP }, textColor: [122, 124, 135] },
      1: { cellWidth: 130, cellPadding: { top: 7, bottom: 7, left: 0, right: COL_GAP } },
      2: { cellWidth: 80, halign: "right", cellPadding: { top: 7, bottom: 7, left: 0, right: 0 }, fontStyle: "bold" },
    };
    autoTable(doc, {
      head: [[t("reportView.colDate").toUpperCase(), t("reportPdf.expensesTitle").toUpperCase(), t("reportPdf.colAmount").toUpperCase()]],
      body: data.expenses.map((e) => [e.date, kindLabel[e.kind], eur(e.amount)]),
      startY: y + 8,
      theme: "plain",
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: FOOTER_ZONE },
      tableWidth: 280,
      columnStyles: expenseColStyles,
      didParseCell: makeHeadStyler(expenseColStyles, 2),
      didDrawCell: makeRuleDrawer(2),
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

  // ── Totales ────────────────────────────────────────────────────────────────
  // Decisión de la propietaria: el importe del viaje es SOLO kilometraje; el
  // suplemento por pasajeros va como línea separada (los pasajeros por viaje
  // ya están en la tabla — producción/Finanzamt lo interpretan).
  const travelTotal = totalAmountTable;
  const totalPassengers = data.trips.reduce((acc, trip) => acc + trip.passengers, 0);
  const passengerTotal = totalPassengers * data.passengerSurcharge;
  const grandTotal = travelTotal + passengerTotal + expensesTotal;

  y = ensureSpace(y, 60);
  const lineRight = (text: string, yy: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(122, 124, 135);
    doc.text(text, rightEdge, yy, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  // Desglose SOLO cuando hay más de un componente; con solo kilometraje iría
  // el mismo importe dos veces (estilo factura).
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
    y += 4;
  }

  // Caja negra del total (v10, 2026-07-12): barra fina con ESQUINAS RECTAS
  // (documento profesional, sin border-radius). A la izquierda "Kilometer
  // gesamt: X km · N Drehtage · inkl. …" (el km lleva su nombre, no solo la
  // cifra); a la derecha GESAMT + total. Aquí viven los totales.
  const shootDays = new Set(data.trips.map((trip) => trip.date)).size;
  const shootDaysText = shootDays === 1 ? t("reportPdf.shootDayOne") : tf("reportPdf.shootDays", { count: shootDays });
  const BOX_H = 34;
  const BOX_PAD = 14;
  y = ensureSpace(y, BOX_H + 12);
  y += 6;
  doc.setFillColor(16, 17, 20);
  doc.rect(PAGE_MARGIN, y, availableWidth, BOX_H, "F");
  const midY = y + BOX_H / 2;

  const summaryParts = [`${t("reportPdf.totalKmLabel")}: ${km(totalKmTable)}`, shootDaysText];
  if (showCo2 && data.co2Kg > 0) summaryParts.push(`${t("reportPdf.totalCo2Label")}: ${nf1.format(data.co2Kg)} kg`);
  if (passengerTotal > 0) summaryParts.push(t("reportPdf.inclPassengerSurcharge"));
  if (expensesTotal > 0) summaryParts.push(t("reportPdf.inclExpenses"));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(168, 171, 178);
  doc.text(summaryParts.join(" · "), PAGE_MARGIN + BOX_PAD, midY + 2.5);

  const totalText = eur(grandTotal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const totalW = doc.getTextWidth(totalText);
  doc.setTextColor(255, 255, 255);
  doc.text(totalText, rightEdge - BOX_PAD, midY + 4.5, { align: "right" });
  doc.setFontSize(7);
  doc.setTextColor(150, 153, 160);
  doc.text(t("reportPdf.totalBoxLabel").toUpperCase(), rightEdge - BOX_PAD - totalW - 8, midY + 2.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += BOX_H + 14;

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
