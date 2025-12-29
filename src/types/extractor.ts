export type JobStatus = 'created' | 'queued' | 'processing' | 'done' | 'failed' | 'needs_review' | 'out_of_quota';
export type PdfKind = 'native_text' | 'scanned' | 'unknown';

export interface CallsheetJob {
  id: string;
  user_id: string;
  storage_path: string;
  status: JobStatus;
  pdf_kind: PdfKind;
  model_path?: string;
  error?: string;
  needs_review_reason?: string;
  created_at: string;
  processed_at?: string;
}

export interface CallsheetResult {
  job_id: string;
  
  date_value?: string;
  date_page?: number;
  date_evidence?: string;
  date_confidence?: number;
  
  project_value?: string;
  project_page?: number;
  project_evidence?: string;
  project_confidence?: number;
  
  producer_value?: string;
  producer_page?: number;
  producer_evidence?: string;
  producer_confidence?: number;
  producer_logo_detected: boolean;
  producer_needs_review: boolean;
}

export interface CallsheetLocation {
  id: string;
  job_id: string;
  
  name_raw?: string;
  address_raw?: string;
  label_source?: string;
  page?: number;
  evidence_text?: string;
  confidence?: number;
  
  place_id?: string;
  formatted_address?: string;
  lat?: number;
  lng?: number;
  geocode_quality?: string;
}

export interface CallsheetExcludedBlock {
  id: string;
  job_id: string;
  label: string;
  page?: number;
  evidence_text?: string;
  reason?: string;
}

export interface ProducerMapping {
  id: string;
  user_id: string;
  project_key: string;
  producer_name: string;
}
