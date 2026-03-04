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
        description: "Verbatim filming location address or venue name from the document. Copy exactly as written — never invent or complete addresses."
      },
      description: "Main filming locations only. At least 1 entry. No logistics, no sub-locations, no next-day."
    }
  },
  required: ["date", "projectName", "productionCompanies", "locations"]
};
