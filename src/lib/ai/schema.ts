export const extractionSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "Date of the callsheet shooting day in YYYY-MM-DD format. Not prep dates or wrap dates." },
    projectName: { type: "string", description: "Creative title of the show/film/series being shot. NOT the production company name." },
    productionCompanies: { 
      type: "array", 
      items: { type: "string", description: "Name of a production company, studio or broadcaster involved in the production." },
      description: "List of production companies or studios. May be empty if not found."
    },
    locations: { 
      type: "array", 
      items: { 
        type: "string",
        description: "Physical address or name of a MAIN filming location for this shooting day — where cameras and actors are on set. EXTRACT locations ONLY from the document content. NEVER invent or infer addresses. ONLY the main filming location(s), NOT logistics (parking, catering, makeup, wardrobe, basecamp, load/unload, crew bus), NOT production offices, NOT next-day locations, NOT drone/aerial/2nd units. If the location is a building or complex (e.g. a hotel), extract ONLY the building/complex name and main address — do NOT include sub-locations within it (e.g. 'Foyer', 'You Bar', 'Kiosk im Hof', 'Keller', 'Lobby'). Normalize: expand abbreviations (C/ → Calle, Str. → Straße, etc.). Vienna Bezirk: '13. Street 6C' → 'Street 6C, 1130 Wien'. If address is incomplete, append city from context. If only a venue/landmark, use venue + city."
      },
      description: "Main filming locations ONLY for THIS shooting day. At least 1 entry required. No logistics, no sub-locations within buildings, no next-day plans."
    }
  },
  required: ["date", "projectName", "productionCompanies", "locations"]
};
