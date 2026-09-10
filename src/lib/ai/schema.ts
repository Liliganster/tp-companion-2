import { LOCATION_COLLECTION_RULE, LOCATION_DESTINATION_RULE, LOCATION_LABEL_RULE, LOCATION_DAY_RULE, LOCATION_UNIT_RULE } from './locationPolicy.js';

// Strict schema keywords: policy constants belong in descriptions, never as
// extra API fields. This catches malformed nested schemas during typecheck.
type ExtractionSchemaNode = {
  type: 'object' | 'array' | 'string' | 'boolean';
  description?: string;
  enum?: string[];
  properties?: Record<string, ExtractionSchemaNode>;
  items?: ExtractionSchemaNode;
  required?: string[];
};

export const extractionSchema = {
  type: "object",
  properties: {
    documentUnit: { type: "string", enum: ["main_unit", "other_unit", "mixed", "unspecified", "uncertain"], description: LOCATION_UNIT_RULE },
    date: { type: "string", description: "Main shooting date printed on the FIRST PAGE, in YYYY-MM-DD; never the file creation, upload or revision date. If the year is not printed, use any plausible year — the code corrects it." },
    dateRaw: { type: "string", description: "The main shooting date EXACTLY as printed on the FIRST PAGE, verbatim (e.g. 'Tuesday, 19th Nov' or 'Montag, 06.05.2024')." },
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
          unitScope: { type: "string", enum: ["main_unit", "other_unit", "unspecified", "uncertain"], description: LOCATION_UNIT_RULE },
          unitEvidence: { type: "string", description: "Verbatim governing unit heading or table column together with THIS address block. Empty string only if no unit is named. Never borrow the heading of a different unit." },
          dayScope: { type: "string", enum: ["document_day", "other_day", "uncertain"], description: LOCATION_DAY_RULE },
          dayDate: { type: "string", description: "Explicit complete date governing this block, YYYY-MM-DD; empty string if the block/heading does not print a full date with year. Never infer it from upload time." },
          dayEvidence: { type: "string", description: "Verbatim address block plus its governing day heading/column (quote separate blocks on separate lines; they need not be adjacent), including the associated Maps link if printed. Preserve the evidence that relates THIS location to its day." },
          label: {
            type: "string",
            description: LOCATION_LABEL_RULE
          },
          address: {
            type: "string",
            description: "The address verbatim from the document. Never invent or complete. Not transit directions, floor numbers or notes."
          },
          addressCorrected: {
            type: "string",
            description: "The same address made geocodable: fix ONLY obvious street-name typos and append city/postal code if printed elsewhere in the document. NEVER a different place, NEVER invented house numbers. Empty string if no correction needed."
          }
        },
        required: ["label", "address", "dayScope", "dayDate", "dayEvidence", "unitScope", "unitEvidence"]
      },
      description: `${LOCATION_COLLECTION_RULE} ${LOCATION_DESTINATION_RULE}`
    }
  },
  required: ["documentUnit", "date", "projectName", "productionCompanies", "locations"]
} satisfies ExtractionSchemaNode;
