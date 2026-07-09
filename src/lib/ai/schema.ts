export const extractionSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "Shooting day date in YYYY-MM-DD. If the year is not printed, use any plausible year — the code corrects it." },
    dateRaw: { type: "string", description: "The shooting date EXACTLY as printed in the document, verbatim (e.g. 'Tuesday, 19th Nov' or 'Montag, 06.05.2024')." },
    dateYearInDocument: { type: "boolean", description: "true ONLY if a 4-digit year is explicitly printed next to the shooting date; false if the document omits the year." },
    projectName: { type: "string", description: "Show/film/series title (e.g. 'Dark', 'Tatort'). NOT the production company. Look in header, 'Projekt:'/'Serie:' labels." },
    productionCompanies: {
      type: "array",
      items: { type: "string", description: "Production company name (has GmbH/LLC/Productions)." },
      description: "All production companies. Look for 'Produktion:' label, GmbH names, logos. Empty array if none."
    },
    locations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Section label EXACTLY as printed next to this address (e.g. 'MOTIV', 'LOCATION 2', 'SET', 'DREHORT'). Empty string if unlabeled."
          },
          address: {
            type: "string",
            description: "The address verbatim from the document. Never invent or complete. Not transit directions, floor numbers or notes."
          }
        },
        required: ["label", "address"]
      },
      description: "Every labeled address block: filming (Motiv/Set/Location) AND logistics (Basis/Parken/Catering/Maske/Cast…). The code routes them by label."
    }
  },
  required: ["date", "projectName", "productionCompanies", "locations"]
};
