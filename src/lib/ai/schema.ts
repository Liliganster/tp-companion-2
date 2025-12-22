export const extractionSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "Date of the callsheet in YYYY-MM-DD format" },
    projectName: { type: "string" },
    productionCompanies: { 
      type: "array", 
      items: { type: "string" } 
    },
    locations: { 
      type: "array", 
      items: { type: "string" },
      description: "List of physical filming locations (addresses or names)"
    }
  },
  required: ["date", "projectName", "productionCompanies", "locations"]
};
