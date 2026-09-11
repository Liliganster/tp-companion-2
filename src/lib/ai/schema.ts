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
    documentUnit: { type: "string", enum: ["main_unit", "other_unit", "mixed", "unspecified", "uncertain"], description: 'Unit governing this document/block; unspecified when no unit is named.' },
    date: { type: "string", description: "Main shooting date printed on the FIRST PAGE, in YYYY-MM-DD; never the file creation, upload or revision date. If its year is missing, return an empty string and preserve dateRaw for review. Never infer a year. If the shooting date itself is absent, return an empty string." },
    dateRaw: { type: "string", description: "The main shooting date EXACTLY as printed on the FIRST PAGE, verbatim (e.g. 'Tuesday, 19th Nov' or 'Montag, 06.05.2024')." },
    dateYearInDocument: { type: "boolean", description: "true ONLY if a year is explicitly documented and clearly governs the first-page shooting date, even across associated headings. A year belonging only to a revision, another day or an unrelated block is not evidence. false if the applicable year is absent." },
    projectName: { type: "string", description: "Film/show/project title established from the whole header and context, including standalone titles without a field label. Not a venue, slogan or producer." },
    documentReviewReason: { type: 'string', description: 'Concrete unresolved whole-document conflict after reconciling sites and schedule. Empty when none; site-specific conflicts go in that site reviewReason.' },
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
          locationKind: { type: 'string', enum: ['physical_destination', 'internal_marker', 'mobile_scene', 'uncertain'], description: 'A real physical site, a subarea of a known site, a moving scene with no independent real-world site, or an unresolved physical-site association. Fictional setting is not itself a destination.' },
          siteEvidence: { type: 'string', description: 'Brief factual references to pages/sections connecting this site to the shooting schedule and address. Include governing aliases or conflicts when relevant. No reasoning transcript or invented quotations.' },
          addressRelation: { type: 'string', enum: ['set_address', 'access_only', 'unresolved'], description: 'Whether the supplied address belongs to this physical site, only its parking/meeting/loading access, or is unresolved. Do not substitute access for the set. For excluded logistics use access_only.' },
          role: { type: 'string', enum: ['filming', 'logistics', 'other', 'uncertain'], description: 'Physical filming use, support logistics, non-destination, or concrete uncertainty.' },
          reviewReason: { type: 'string', description: 'Concrete unresolved conflict, empty when none.' },
          unitScope: { type: "string", enum: ["main_unit", "other_unit", "unspecified", "uncertain"], description: 'Unit governing this document/block; unspecified when no unit is named.' },
          dayScope: { type: "string", enum: ["document_day", "other_day", "uncertain"], description: 'Relation to the FIRST PAGE shooting date, using the governing block context.' },
          dayDate: { type: "string", description: "Explicit complete date governing this block, YYYY-MM-DD; empty string if the block/heading does not print a full date with year. Never infer it from upload time." },
          label: {
            type: "string",
            description: 'Governing printed site label, copied verbatim. Associated aliases belong in siteEvidence when consolidating the same physical site. Empty if none is printed.'
          },
          address: {
            type: "string",
            description: "Original site address, venue, coordinates or link from its associated document evidence. Preserve original spelling; never invent. Keep access distinct from site identity in siteEvidence."
          },
          normalizedAddress: {
            type: 'string',
            description: 'Postal address of the actual site assembled from associated evidence across the document, with supported locality, ranges, building suffixes and intersections preserved. Remove venue names and internal room/floor details. Never invent components or turn an access-only address into the set. Empty for access_only/unresolved or when no postal site address is supplied; preserve original venue/coordinates/link for review.'
          }
        },
        required: ["locationKind", "label", "address", "normalizedAddress", "role", "dayScope", "unitScope", "addressRelation", "siteEvidence", "reviewReason"]
      },
      description: 'Physical sites reconciled against the whole shooting day, in document order, with separate logistics for exclusion. Consolidate scene aliases of the same site; do not enumerate every address or scene row.'
    }
  },
  required: ["documentUnit", "date", "projectName", "productionCompanies", "documentReviewReason", "locations"]
} satisfies ExtractionSchemaNode;
