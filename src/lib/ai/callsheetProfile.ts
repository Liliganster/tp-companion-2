import { CALLSHEET_PROVIDER_TIMEOUT_MS } from '../callsheetTiming.js';
import type { GenerationOptions } from './geminiClient.js';

// One provider request per user action, shared by direct and queued extraction.
export const CALLSHEET_PROFILE_VERSION = 'callsheet-2026-09-11-v6-visual-roles';
export const CALLSHEET_MODEL = 'gemini-2.5-flash';
export const CALLSHEET_GENERATION_OPTIONS: GenerationOptions = Object.freeze({
  timeoutMs: CALLSHEET_PROVIDER_TIMEOUT_MS,
  maxOutputTokens: 8192,
  thinkingBudget: 1024,
  allowSchemaRetry: false,
});
