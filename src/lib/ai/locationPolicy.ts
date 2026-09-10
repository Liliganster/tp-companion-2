export const LOCATION_ROLE_RULE = 'Classify each block by its governing context: filming for an explicitly physical filming set (including equivalent context without a printed label), logistics for support addresses, other for contacts or non-destinations, uncertain only when there is a concrete conflict about filming use. Explain an uncertain role in reviewReason. A place name such as Hospital does not override an explicit filming context. Never infer filming merely because an address exists.';

// Shared by the prompt and structured-output schema: collection is not route selection.
export const LOCATION_COLLECTION_RULE =
  'Return every location block within the document sections in scope, including filming AND logistics. Keep each block with its own original label and address; never merge different blocks.';

export const LOCATION_LABEL_RULE =
  'Copy the section label exactly as printed (MOTIV, SET, LOCATION, DREHORT, BASIS, PARKEN, CATERING, etc.). Leave it empty if no label is printed. Never relabel logistics as filming.';

export const LOCATION_DESTINATION_RULE =
  'Only physical filming locations identified by MOTIV, SET, LOCATION, DREHORT or equivalent shooting context are eligible trip destinations. Logistics are collected separately for future features, not used as filming destinations. More than one filming location is valid for the same shooting day.';

export const LOCATION_DAY_RULE =
  'First identify the main shooting date printed on the FIRST PAGE of this callsheet, not its file creation, upload, issue or revision date. This first-page shooting date is the reference for document_day throughout ALL pages. A location need not repeat that date: inherit it from the governing shooting-day context unless an explicit different day applies. Never select the reference date from a later-page preview. For each location, determine the day from its own block, enclosing heading, table column and cross-references. dayScope is document_day only with clear evidence that it belongs to that shooting day; other_day for previous/future days; uncertain when ambiguous. Never inherit the main date across an explicit other-day heading. Include all filming locations for the document day, not just the first.';

export const LOCATION_UNIT_RULE =
  'Determine the filming unit from the governing document header, section, column and cross-references, not from an address or crew contact. documentUnit is main_unit, other_unit, mixed, unspecified or uncertain. For each location unitScope is main_unit, other_unit, unspecified (no unit is named) or uncertain. Do not mix second-unit locations with the main crew. A document without unit labels remains eligible; absence of a unit label is not a reason to reject it.';
