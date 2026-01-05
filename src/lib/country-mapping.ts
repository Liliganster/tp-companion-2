export function getCountryCode(countryName?: string): string | undefined {
  if (!countryName) return undefined;

  const trimmed = countryName.trim();
  if (!trimmed) return undefined;

  // Accept ISO 3166-1 alpha-2 codes directly (e.g. "AT", "DE").
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toLowerCase();

  // Normalize (lowercase + remove diacritics) so inputs like "Österreich" / "España" work.
  const normalized = trimmed.toLowerCase();
  const ascii = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const key = ascii.replace(/\s+/g, " ").trim();

  const countryMap: Record<string, string> = {
    // Austria
    austria: "at",
    osterreich: "at",
    "republic of austria": "at",

    // Germany
    germany: "de",
    deutschland: "de",
    alemania: "de",

    // Spain
    spain: "es",
    espana: "es",

    // Italy
    italy: "it",
    italia: "it",

    // France
    france: "fr",
    francia: "fr",

    // Switzerland
    switzerland: "ch",
    schweiz: "ch",
    suisse: "ch",
    svizzera: "ch",
    suiza: "ch",

    // Belgium
    belgium: "be",
    belgique: "be",
    belgie: "be",
    belgica: "be",

    // Netherlands
    netherlands: "nl",
    nederland: "nl",
    "paises bajos": "nl",
    holanda: "nl",

    // Portugal
    portugal: "pt",

    // United Kingdom
    uk: "gb",
    "united kingdom": "gb",
    "reino unido": "gb",
    "great britain": "gb",
    "gran bretana": "gb",

    // Poland
    poland: "pl",
    polska: "pl",
    polonia: "pl",

    // Czech Republic
    "czech republic": "cz",
    czechia: "cz",
    cesko: "cz",
    "republica checa": "cz",

    // Hungary
    hungary: "hu",
    magyarorszag: "hu",
    hungria: "hu",

    // Slovakia
    slovakia: "sk",
    slovensko: "sk",
    eslovaquia: "sk",

    // Slovenia
    slovenia: "si",
    slovenija: "si",
    eslovenia: "si",

    // Croatia
    croatia: "hr",
    hrvatska: "hr",
    croacia: "hr",
  };

  return countryMap[key];
}
