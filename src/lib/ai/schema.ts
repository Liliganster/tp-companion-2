export const extractionSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "Shooting day date in YYYY-MM-DD. Not prep/wrap/next-day dates." },
    projectName: { type: "string", description: "Creative title of the show/film/series. Not the production company." },
    productionCompanies: {
      type: "array",
      items: { type: "string", description: "Production company or studio name." },
      description: "All production companies. Empty array if none found."
    },
    locations: {
      type: "array",
      items: {
        type: "string",
        description: "ONLY where the camera shoots scenes (Drehort/Set). Verbatim from document. NEVER include Base, Parking, Catering, Makeup, Office, or any logistics address."
      },
      description: "Filming locations only (Drehort/Set). At least 1. Exclude all logistics (Base, Parking, Catering, Makeup, Office, etc). No sub-rooms. No next-day."
    }
  },
  required: ["date", "projectName", "productionCompanies", "locations"]
};
