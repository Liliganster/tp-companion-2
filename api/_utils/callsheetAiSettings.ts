import type { AiUserSettings } from '../../src/lib/ai/geminiClient.js';

export class AiProviderUnavailableError extends Error {
  constructor() { super('ai_provider_unavailable'); }
}

// An unavailable configuration is never permission to switch paid providers.
export function resolveCallsheetAiSettings(profile: {
  openrouter_enabled?: boolean | null;
  openrouter_api_key?: string | null;
  openrouter_model?: string | null;
} | null | undefined, planTier: string | undefined): AiUserSettings | undefined {
  if (!profile) throw new AiProviderUnavailableError();
  if (!profile.openrouter_enabled) return undefined;
  const key = profile.openrouter_api_key?.trim();
  if (planTier !== 'pro' || !key) throw new AiProviderUnavailableError();
  return { openrouterEnabled: true, openrouterApiKey: key,
    openrouterModel: profile.openrouter_model?.trim() || 'google/gemini-2.5-flash' };
}
