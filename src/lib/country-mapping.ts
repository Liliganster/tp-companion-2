export function getCountryCode(countryName?: string): string | undefined {
    if (!countryName) return undefined;
    const normalized = countryName.trim().toLowerCase();

    const countryMap: Record<string, string> = {
        // Austria
        "austria": "at",
        "österreich": "at",

        // Germany
        "germany": "de",
        "deutschland": "de",
        "alemania": "de",

        // Spain
        "spain": "es",
        "españa": "es",
        "espana": "es",

        // Italy
        "italy": "it",
        "italia": "it",

        // France
        "france": "fr",
        "francia": "fr",

        // Switzerland
        "switzerland": "ch",
        "schweiz": "ch",
        "suisse": "ch",
        "svizzera": "ch",
        "suiza": "ch",

        // Belgium
        "belgium": "be",
        "belgique": "be",
        "belgië": "be",
        "bélgica": "be",
        "belgica": "be",

        // Netherlands
        "netherlands": "nl",
        "nederland": "nl",
        "países bajos": "nl",
        "paises bajos": "nl",
        "holanda": "nl", // Common alias

        // Portugal
        "portugal": "pt",

        // UK
        "uk": "gb",
        "united kingdom": "gb",
        "reino unido": "gb",
        "great britain": "gb",
        "gran bretaña": "gb",

        // Poland
        "poland": "pl",
        "polska": "pl",
        "polonia": "pl",

        // Czech Republic
        "czech republic": "cz",
        "czechia": "cz",
        "česko": "cz",
        "república checa": "cz",
        "republica checa": "cz",

        // Hungary
        "hungary": "hu",
        "magyarország": "hu",
        "hungría": "hu",
        "hungria": "hu",

        // Slovakia
        "slovakia": "sk",
        "slovensko": "sk",
        "eslovaquia": "sk",

        // Slovenia
        "slovenia": "si",
        "slovenija": "si",
        "eslovenia": "si",

        // Croatia
        "croatia": "hr",
        "hrvatska": "hr",
        "croacia": "hr",
    };

    return countryMap[normalized];
}
