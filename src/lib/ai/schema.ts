export const extractionSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "Shooting day date in YYYY-MM-DD." },
    projectName: { type: "string", description: "Show/film/series title (e.g. 'Dark', 'Tatort'). NOT the production company. Look in header, 'Projekt:'/'Serie:' labels." },
    productionCompanies: {
      type: "array",
      items: { type: "string", description: "Production company name (has GmbH/LLC/Productions)." },
      description: "All production companies. Look for 'Produktion:' label, GmbH names, logos. Empty array if none."
    },
    locations: {
      type: "array",
      items: {
        type: "string",
        description: "Drehort/Set/Motiv address only. Verbatim from document. NEVER include Base, Parking, Catering, Makeup, Office addresses."
      },
      description: "Filming locations only (where camera shoots). Exclude all logistics addresses."
    }
  },
  required: ["date", "projectName", "productionCompanies", "locations"]
};
