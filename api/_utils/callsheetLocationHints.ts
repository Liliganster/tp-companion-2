const MAPS_URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EXPLICIT_VENUE_RE = /@\s*([^@\n\r|]{2,80})/gi;
const INTERNAL_SUBLOCATION_RE =
  /\b(foyer|lobby|bar|keller|stock(?:\s*-\s*\d+)?|floor|room|sala|salon|hall|halle|velvet|erdgeschoss|geschoss|see plan|siehe plan)\b/i;
const RELEVANT_PDF_LINE_RE =
  /\b(location\b|loc(?:ation)?\s*\d+|set\b|motiv\b|drehort\b|drehlocation\b|film(?:ing)?\s+location\b|shoot(?:ing)?\s+location\b|venue\b|hotel\b|studio\b|maps\.app\.goo\.gl|google\.com\/maps|@)\b/i;
const LOCATION_LABEL_RE =
  /^(?:location|loc(?:ation)?|set|motiv|drehort|drehlocation|film(?:ing)?\s+location|shoot(?:ing)?\s+location|set\s+address|location\s+set)\s*(?:[#.]?\s*\d+)?$/i;
const LOCATION_LABEL_WITH_VALUE_RE =
  /^(?:location|loc(?:ation)?|set|motiv|drehort|drehlocation|film(?:ing)?\s+location|shoot(?:ing)?\s+location|set\s+address|location\s+set)\s*(?:[#.]?\s*\d+)?\s*(?:[:=|-]+)\s*(.+)$/i;
const EXCLUDED_LOCATION_LABEL_RE =
  /^(?:lunch|mittag|mittagessen|catering|parking|crew parking|crew bus|base(?:camp)?|make(?:-?up)?|hair|wardrobe|kost[uü]m|garderobe|production office|produktionsb[uü]ro|office|hospital|doctor|medic|load(?:\s*&\s*unload)?|unload|pickup|dropoff)\b/i;
const GENERIC_LOCATION_VALUE_RE =
  /^(?:location|loc(?:ation)?|address|adresse|set|motiv|drehort|drehlocation|film(?:ing)?\s+location|shoot(?:ing)?\s+location)$/i;
const TABLE_SPLIT_RE = /\s+\|\s+|\|+|\t+|\s{2,}/;

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function cleanVenueName(value: string) {
  return String(value ?? "")
    .replace(MAPS_URL_RE, " ")
    .replace(/\b(siehe plan|see plan)\b/gi, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[@\s-]+/, "")
    .replace(/[,:;.-]+$/, "")
    .trim();
}

function cleanLocationCandidate(value: string) {
  const cleaned = String(value ?? "")
    .replace(MAPS_URL_RE, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:address|adresse)\s*[:=-]?\s*/i, "")
    .replace(/[,:;.-]+$/, "")
    .trim();

  if (!cleaned) return "";
  if (GENERIC_LOCATION_VALUE_RE.test(cleaned)) return "";
  const normalizedWords = cleaned
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(?:location|loc(?:ation)?|address|adresse|set|motiv|drehort|drehlocation|film(?:ing)?|shoot(?:ing)?)(?:\s+(?:location|loc(?:ation)?|address|adresse|set|motiv|drehort|drehlocation|film(?:ing)?|shoot(?:ing)?))*$/i.test(
      normalizedWords,
    )
  ) {
    return "";
  }
  return cleaned;
}

function isExcludedLocationLabel(value: string) {
  return EXCLUDED_LOCATION_LABEL_RE.test(String(value ?? "").trim());
}

function isLocationLabel(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return false;
  return LOCATION_LABEL_RE.test(normalized) || LOCATION_LABEL_WITH_VALUE_RE.test(normalized);
}

function extractInlineLabeledValue(line: string) {
  const normalized = String(line ?? "").trim();
  if (!normalized || isExcludedLocationLabel(normalized)) return "";

  const directMatch = normalized.match(LOCATION_LABEL_WITH_VALUE_RE);
  if (directMatch?.[1]) return cleanLocationCandidate(directMatch[1]);

  const columns = normalized.split(TABLE_SPLIT_RE).map((part) => part.trim()).filter(Boolean);
  if (columns.length < 2) return "";
  if (isExcludedLocationLabel(columns[0])) return "";
  if (!isLocationLabel(columns[0])) return "";

  return cleanLocationCandidate(columns.slice(1).join(" "));
}

export function extractVenueCandidates(text: string) {
  const input = String(text ?? "");
  if (!input.trim()) return [];

  const venues: string[] = [];
  for (const match of input.matchAll(EXPLICIT_VENUE_RE)) {
    const cleaned = cleanVenueName(match[1] ?? "");
    if (cleaned) venues.push(cleaned);
  }

  return dedupeStrings(venues);
}

export function extractLabeledLocationCandidates(pdfText: string) {
  const lines = String(pdfText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const candidates: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || isExcludedLocationLabel(line)) continue;

    const inlineValue = extractInlineLabeledValue(line);
    if (inlineValue) {
      candidates.push(inlineValue);
      continue;
    }

    if (!LOCATION_LABEL_RE.test(line)) continue;

    const nextLines: string[] = [];
    for (let offset = 1; offset <= 2; offset += 1) {
      const nextLine = lines[index + offset];
      if (!nextLine) break;
      if (isExcludedLocationLabel(nextLine) || isLocationLabel(nextLine)) break;
      nextLines.push(nextLine);
    }

    const groupedValue = cleanLocationCandidate(nextLines.join(" "));
    if (groupedValue) candidates.push(groupedValue);
  }

  return dedupeStrings(candidates);
}

export function buildCallsheetPdfHintText(pdfText: string) {
  const lines = String(pdfText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  const pickedIndexes = new Set<number>();
  lines.forEach((line, index) => {
    if (!RELEVANT_PDF_LINE_RE.test(line)) return;

    for (let offset = -1; offset <= 1; offset += 1) {
      const target = index + offset;
      if (target >= 0 && target < lines.length) pickedIndexes.add(target);
    }
  });

  const selected = Array.from(pickedIndexes)
    .sort((a, b) => a - b)
    .map((index) => lines[index])
    .filter(Boolean);

  const compacted: string[] = [];
  const labeledCandidates = extractLabeledLocationCandidates(pdfText);
  if (labeledCandidates.length > 0) {
    compacted.push("EXPLICIT LOCATION CANDIDATES FROM PDF LABELS:");
    labeledCandidates.forEach((candidate, index) => {
      compacted.push(`${index + 1}. ${candidate}`);
    });
    compacted.push("");
  }

  let totalLength = compacted.join("\n").length;
  for (const line of selected) {
    if (compacted.length >= 40) break;
    const nextLine = line.length > 220 ? `${line.slice(0, 217)}...` : line;
    if (totalLength + nextLine.length > 3200) break;
    compacted.push(nextLine);
    totalLength += nextLine.length;
  }

  return compacted.join("\n");
}

export function normalizeExtractedCallsheetLocations(args: {
  locations: string[];
  pdfText?: string | null;
}) {
  const { locations, pdfText } = args;
  const globalVenues = dedupeStrings([
    ...extractVenueCandidates(String(pdfText ?? "")),
    ...extractVenueCandidates((locations ?? []).join("\n")),
  ]);

  const normalized = (locations ?? [])
    .map((value) => {
      const original = String(value ?? "").trim();
      if (!original) return "";

      const cleanedBase = cleanLocationCandidate(original);
      if (!cleanedBase) return "";

      const explicitVenues = extractVenueCandidates(cleanedBase);
      if (explicitVenues.length > 0) {
        return explicitVenues[explicitVenues.length - 1];
      }

      const withoutPlanNotes = cleanedBase
        .replace(/\b(siehe plan|see plan)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (
        !/\d/.test(withoutPlanNotes) &&
        INTERNAL_SUBLOCATION_RE.test(withoutPlanNotes) &&
        globalVenues.length === 1
      ) {
        return globalVenues[0];
      }

      return withoutPlanNotes;
    })
    .filter(Boolean);

  return dedupeStrings(normalized);
}
