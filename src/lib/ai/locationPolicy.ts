// Shared by the prompt and structured-output schema: collection is not route selection.
export const LOCATION_COLLECTION_RULE =
  'Return every location block within the document sections in scope, including filming AND logistics. Keep each block with its own original label and address; never merge different blocks.';

export const LOCATION_LABEL_RULE =
  'Copy the section label exactly as printed (MOTIV, SET, LOCATION, DREHORT, BASIS, PARKEN, CATERING, etc.). Leave it empty if no label is printed. Never relabel logistics as filming.';

export const LOCATION_DESTINATION_RULE =
  'Only physical filming locations identified by MOTIV, SET, LOCATION, DREHORT or equivalent shooting context are eligible trip destinations. Logistics are collected separately for future features, not used as filming destinations. More than one filming location is valid for the same shooting day.';
