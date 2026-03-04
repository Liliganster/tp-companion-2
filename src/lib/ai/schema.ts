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
        description: "Physical address or explicit filming venue of a MAIN UNIT filming location for this shooting day — where cameras and actors are on set. EXTRACT locations ONLY from the document content. NEVER invent or infer addresses from general knowledge. Normalize: expand abbreviations (C/ → Calle, Pza./Pl. → Plaza, Avda./Av. → Avenida, Ctra. → Carretera, Pº → Paseo, P.I./Pol.Ind. → Polígono Industrial, Urb. → Urbanización, Str. → Straße, Pl. → Platz). Vienna Bezirk format: '13. Erzbischofgasse 6C' → 'Erzbischofgasse 6C, 1130 Wien' (pattern: {N}. Street Num → Street Num, 1{NN}0 Wien). If address is incomplete, append city from document context. If only a venue/landmark exists, use venue + city. If a row says things like '@Le Meridien', 'Foyer ... @Le Meridien', 'Your Bar ... @Le Meridien' or includes a maps.app.goo.gl link next to the venue, use the venue itself, not the internal room label. EXCLUDE: logistics (parking, catering, makeup, wardrobe, basecamp, load/unload, crew bus), production offices (unless explicitly labeled as set/filming), addresses under next-day sections (Next Day / Nächster Drehtag / Día Siguiente / Tomorrow / Advance Schedule / any section with a date different from the main date), drone/aerial unit sections (Drone Unit / Aerial Unit / Drohnen / Luftaufnahmen), 2nd unit sections (2nd Unit / B-Unit / Segunda Unidad / Zweite Einheit / B-Einheit). If both venue name and street address exist in the same location row, use the exact street address."
      },
      description: "Filming locations for THIS shooting day only (main date in document header). MAIN UNIT only. Addresses must come from the document — never invented. Exclude: logistics, production offices, next-day plans, drone/aerial units, 2nd units. At least 1 entry required."
    }
  },
  required: ["date", "projectName", "productionCompanies", "locations"]
};
