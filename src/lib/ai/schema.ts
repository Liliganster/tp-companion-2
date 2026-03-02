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
        description: "Physical address or well-known landmark of a filming location (where cameras roll, MAIN UNIT ONLY). Must be geocodable. Rules: (1) Expand abbreviations: C/ → Calle, Pza./Pl. → Plaza, Avda./Av. → Avenida, Ctra. → Carretera, Pº → Paseo, P.I./Pol.Ind. → Polígono Industrial, Urb. → Urbanización, Str. → Straße, Pl. → Platz. (2) Vienna/Wien Bezirk format: '13. Erzbischofgasse 6C' means district 13 → convert to 'Erzbischofgasse 6C, 1130 Wien'. Pattern: '{N}. StreetName HouseNum' → 'StreetName HouseNum, 1{NN}0 Wien'. (3) If address is incomplete, append city from document context. (4) EXCLUDE: logistics (parking, catering, makeup, wardrobe, crew bus), production offices, drone/aerial unit locations, 2nd unit / B-Unit locations, any address under a section labeled Drone, Aerial, 2nd Unit, B-Einheit, Segunda Unidad. (5) Use only the physical address, not the venue name when a street address is available."
      },
      description: "Array of physical filming locations for THIS shooting day only (the main date in the document header). IGNORE any locations under sections labeled Next Day, Tomorrow, Nächster Drehtag, Día Siguiente, Advance Schedule, or any section with a different date. Each string must be a geocodable address. Expand all abbreviations. Include at least 1 location."
    }
  },
  required: ["date", "projectName", "productionCompanies", "locations"]
};
