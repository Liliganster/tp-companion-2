import { expect, it } from 'vitest';
import { resolveCallsheetAiSettings } from './callsheetAiSettings';
it('keeps the selected OpenRouter model and credential', () => {
  expect(resolveCallsheetAiSettings({openrouter_enabled:true,openrouter_api_key:' key ',openrouter_model:'google/gemini-3.8-flash'},'pro'))
    .toEqual({openrouterEnabled:true,openrouterApiKey:'key',openrouterModel:'google/gemini-3.8-flash'});
});
it.each([null, undefined])('blocks a missing profile instead of selecting Gemini (%s)', profile => {
  expect(() => resolveCallsheetAiSettings(profile,'pro')).toThrow('ai_provider_unavailable');
});
it.each(['', '   ', null])('blocks selected OpenRouter with missing credentials (%s)', key => {
  expect(() => resolveCallsheetAiSettings({openrouter_enabled:true,openrouter_api_key:key},'pro')).toThrow('ai_provider_unavailable');
});
it('blocks a plan downgrade without silently switching providers', () => {
  expect(() => resolveCallsheetAiSettings({openrouter_enabled:true,openrouter_api_key:'key'},'basic')).toThrow('ai_provider_unavailable');
});
it('keeps Gemini for users who have not selected OpenRouter', () => {
  expect(resolveCallsheetAiSettings({openrouter_enabled:false},'basic')).toBeUndefined();
});
