import { LOCATION_ROLE_RULE, LOCATION_COLLECTION_RULE, LOCATION_DESTINATION_RULE, LOCATION_LABEL_RULE, LOCATION_DAY_RULE, LOCATION_UNIT_RULE } from './locationPolicy.js';

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
    date: { type: "string", description: "Main shooting date printed on the FIRST PAGE, in YYYY-MM-DD; never the file creation, upload or revision date. If its year is missing, return an empty string and preserve dateRaw for review. Never infer a year. If the shooting date itself is absent, return an empty string." },
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
          role: { type: 'string', enum: ['filming', 'logistics', 'other', 'uncertain'], description: LOCATION_ROLE_RULE },
          reviewReason: { type: 'string', description: 'Concrete unresolved conflict, empty when none.' },
          unitScope: { type: "string", enum: ["main_unit", "other_unit", "unspecified", "uncertain"], description: LOCATION_UNIT_RULE },
          unitEvidence: { type: "string", description: "Optional short unit context; no literal quote or repeated address is required." },
          dayScope: { type: "string", enum: ["document_day", "other_day", "uncertain"], description: LOCATION_DAY_RULE },
          dayDate: { type: "string", description: "Explicit complete date governing this block, YYYY-MM-DD; empty string if the block/heading does not print a full date with year. Never infer it from upload time." },
          dayEvidence: { type: "string", description: "Optional short day context or associated Maps link. No literal quote or repeated date or address is required." },
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
            description: "Deprecated: return an empty string. Preserve the original address without corrections or additions."
          },
          normalizedAddress: {
            type: 'string',
            description: 'Postal street address only, normalized from this block and its governing context: street and house number, postal code and city, country when printed. Reorder arbitrary layouts, join broken lines, separate street and number, expand unambiguous abbreviations. Exclude venue/set names, labels, access instructions, floors, contacts and notes. Never invent missing streets, house numbers, cities or postal codes. Do not turn a venue name into an address from memory. Return empty string when no street address is supplied; preserve the original venue/coordinates/link in address for review.'
          }
        },
        required: ["label", "address", "normalizedAddress", "role", "dayScope", "unitScope"]
      },
      description: `${LOCATION_COLLECTION_RULE} ${LOCATION_DESTINATION_RULE}`
    }
  },
  required: ["documentUnit", "date", "projectName", "productionCompanies", "locations"]
} satisfies ExtractionSchemaNode;
