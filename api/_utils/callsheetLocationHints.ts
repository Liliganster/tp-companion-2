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
  /^(?:lunch|mittag|mittagessen|catering|parking|parken|crew parking|crew parken|crew bus|base(?:camp)?|basis|base\s*[&+]\s*park(?:en|ing)|make(?:-?up)?|hair|wardrobe|kost[uü]m|garderobe|production office|produktionsb[uü]ro|office|hospital|doctor|medic|load(?:\s*&\s*unload)?|unload|pickup|dropoff|tech\s*park(?:en|ing))\b/i;
const TABLE_HEADER_WORDS_RE =
  /^(?:adresse|address|location|loc|set|motiv|drehort|basis|base|parken|parking|\&|und|and|,|\s)+$/i;
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
  if (TABLE_HEADER_WORDS_RE.test(cleaned)) return "";
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

  // Always include the first 8 non-empty lines (header area — contains project name, date, company)
  const headerLines: string[] = [];
  for (let i = 0; i < lines.length && headerLines.length < 8; i++) {
    if (lines[i].length > 2) headerLines.push(lines[i].length > 220 ? `${lines[i].slice(0, 217)}...` : lines[i]);
  }

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

  // Header lines first (project name, date, production company live here)
  if (headerLines.length > 0) {
    compacted.push("DOCUMENT HEADER:");
    compacted.push(...headerLines);
    compacted.push("");
  }

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

// ─── Code-side address normalization (runs AFTER AI extraction, BEFORE geocoding) ──

const BEZIRK_PREFIX_RE = /^(\d{1,2})\.\s+(.+)$/;
const ABBREVIATION_MAP: Record<string, string> = {
  "str.": "Straße",
  "g.": "Gasse",
  "pl.": "Platz",
  "c/": "Calle",
  "pza.": "Plaza",
  "avda.": "Avenida",
  "av.": "Avenida",
  "pº": "Paseo",
  "ctra.": "Carretera",
};
const ABBREVIATION_RE = new RegExp(
  Object.keys(ABBREVIATION_MAP)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"))
    .join("|"),
  "gi"
);

/**
 * Expand Vienna Bezirk prefix: "13. Erzbischofgasse 6C" → "Erzbischofgasse 6C, 1130 Wien"
 */
function expandBezirkPrefix(address: string): string {
  const match = address.match(BEZIRK_PREFIX_RE);
  if (!match) return address;
  const bezirkNum = parseInt(match[1], 10);
  if (bezirkNum < 1 || bezirkNum > 23) return address; // Vienna has 23 Bezirke
  const rest = match[2].trim();
  // Only expand if the rest looks like a street (has letters), not a date like "Februar 2025"
  if (!/[a-zA-ZäöüßÄÖÜ]{3,}/.test(rest)) return address;
  // Avoid matching dates: "25. Februar" or ordinal contexts
  if (/^(?:jänner|januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i.test(rest)) return address;
  const postalCode = `1${String(bezirkNum).padStart(2, "0")}0`;
  return `${rest}, ${postalCode} Wien`;
}

/**
 * Expand common German/Spanish street abbreviations for geocoding.
 */
function expandAbbreviations(address: string): string {
  return address.replace(ABBREVIATION_RE, (match) => {
    return ABBREVIATION_MAP[match.toLowerCase()] ?? match;
  });
}

/**
 * Apply code-side normalization to locations after AI extraction:
 * 1. Vienna Bezirk prefix expansion
 * 2. Street abbreviation expansion
 * These transformations improve geocoding accuracy without asking the AI to guess.
 */
export function postProcessLocationsForGeocoding(locations: string[]): string[] {
  return locations.map((loc) => {
    let result = String(loc ?? "").trim();
    if (!result) return result;
    result = expandBezirkPrefix(result);
    result = expandAbbreviations(result);
    return result;
  });
}

// ─── Logistics filter (code-level safety net) ────────────────────────────────

/**
 * Regex matching logistics-related labels/keywords that should never appear in
 * a filming location. Applied to the full location string (case-insensitive).
 * This catches cases where the AI ignores prompt instructions.
 */
const LOGISTICS_KEYWORD_RE = new RegExp(
  [
    // Base / Basecamp
    "\\b(?:unit\\s*)?base(?:camp)?\\b",
    "\\bbasis(?:camp)?\\b",
    "\\bsammelpunkt\\b",
    "\\btreffpunkt\\b",
    "\\bmeeting\\s*point\\b",
    // Parking
    "\\b(?:crew\\s*)?park(?:ing|en|platz)\\b",
    "\\btech\\s*park(?:ing|en)\\b",
    "\\bfahrer\\b",
    // Catering / meals
    "\\bcatering\\b",
    "\\blunch\\b",
    "\\bfr[uü]hst[uü]ck\\b",
    "\\bbreakfast\\b",
    "\\bmittagessen\\b",
    "\\bmittag\\b",
    "\\bdinner\\b",
    // Makeup / Wardrobe
    "\\bmaske\\b",
    "\\bmake\\s*-?\\s*up\\b",
    "\\bhmu\\b",
    "\\bhair\\s*&?\\s*make",
    "\\bgarderobe\\b",
    "\\bwardrobe\\b",
    "\\bkost[uü]m\\b",
    // Office
    "\\bproduction\\s*office\\b",
    "\\bproduktionsb[uü]ro\\b",
    // Load/Unload
    "\\bload\\s*(?:&|and)?\\s*unload\\b",
    "\\bladerampe\\b",
    "\\banlieferung\\b",
    // Medical
    "\\bhospital\\b",
    "\\bmedic\\b",
    "\\b(?:set\\s*)?arzt\\b",
    // Infrastructure
    "\\btoiletten\\b",
    "\\bgenerator\\b",
    "\\bstromversorgung\\b",
  ].join("|"),
  "i"
);

/**
 * Remove locations that are clearly logistics / non-filming addresses.
 * This is a code-level safety net — even if the AI includes them, we strip them.
 * Returns original array if filtering would empty it (preserves at least AI output).
 */
export function filterLogisticsLocations(locations: string[]): string[] {
  const filtered = locations.filter((loc) => {
    const trimmed = String(loc ?? "").trim();
    if (!trimmed) return false;
    // Pass through sentinel values
    if (/^no\s+location/i.test(trimmed)) return true;
    return !LOGISTICS_KEYWORD_RE.test(trimmed);
  });
  return filtered;
}

/**
 * Cross-validate AI-extracted locations against the actual PDF text.
 * Drops entries that appear to be hallucinated (no significant fragment found in source).
 * Uses both token-level and bigram matching for robustness.
 */
export function filterHallucinatedLocations(args: {
  locations: string[];
  pdfText: string;
}): string[] {
  const { locations, pdfText } = args;
  const normalizedPdf = String(pdfText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!normalizedPdf.trim()) {
    // No PDF text available to validate against — return all (can't prove hallucination)
    return locations;
  }

  // Very generic filler words that match too broadly — exclude from token validation
  const FILLER_WORDS = new Set([
    "wien", "vienna", "berlin", "munich", "münchen", "hamburg", "köln",
    "madrid", "barcelona", "paris", "london", "rome", "roma",
    "the", "and", "und", "der", "die", "das", "von", "van", "del", "des",
    "calle", "avenida", "paseo", "plaza", "carretera",
    "street", "road", "avenue", "lane", "drive", "place",
  ]);

  const validated: string[] = [];

  for (const loc of locations) {
    const trimmed = String(loc ?? "").trim();
    if (!trimmed) continue;

    // "No location found" sentinel — pass through
    if (/^no\s+location/i.test(trimmed)) {
      validated.push(trimmed);
      continue;
    }

    // Extract significant tokens (3+ chars, not generic city/filler)
    // NOTE: street-type words (straße, gasse, platz, ring, weg) are kept as meaningful tokens
    const tokens = trimmed
      .replace(/[,.:;()\-\/|@#]+/g, " ")
      .split(/\s+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 3)
      .filter((t) => !FILLER_WORDS.has(t));

    if (tokens.length === 0) {
      // Only filler/city words — can't validate, keep it
      validated.push(trimmed);
      continue;
    }

    // Token-level matching
    const matchCount = tokens.filter((token) => normalizedPdf.includes(token)).length;
    const matchRatio = tokens.length > 0 ? matchCount / tokens.length : 0;

    // Bigram matching: check consecutive word pairs for stronger evidence
    let bigramHit = false;
    if (tokens.length >= 2) {
      for (let i = 0; i < tokens.length - 1; i++) {
        const bigram = `${tokens[i]} ${tokens[i + 1]}`;
        if (normalizedPdf.includes(bigram)) {
          bigramHit = true;
          break;
        }
      }
    }

    // Accept if: ≥50% token match, OR any bigram hit with ≥1 token match, OR short address with ≥1 match
    const accepted =
      (matchRatio >= 0.5) ||
      (bigramHit && matchCount >= 1) ||
      (tokens.length <= 2 && matchCount >= 1);

    if (accepted) {
      validated.push(trimmed);
    }
    // else: hallucinated — drop it
  }

  return validated;
}
