import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => { vi.stubEnv('GEMINI_API_KEY','offline-gemini-key-present-for-regression'); vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const invoke = async (kind: string, key: string) => {
  const client = await import('./geminiClient');
  const settings = {openrouterEnabled:true,openrouterApiKey:key,openrouterModel:'google/gemini-3.8-flash'};
  const options = {allowSchemaRetry:false};
  if (kind === 'text') return client.generateContent('gemini-2.5-flash','offline',undefined,settings,options);
  if (kind === 'images') return client.generateContentFromImages('gemini-2.5-flash','offline',['AA=='],undefined,settings);
  return client.generateContentFromPDF('gemini-2.5-flash','offline',Buffer.from('offline'),kind === 'pdf' ? 'application/pdf' : 'image/png',undefined,settings,options);
};
it.each(['text','pdf','image','images'])('never calls Gemini for selected OpenRouter without a key: %s', async kind => {
  const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
  await expect(invoke(kind,'   ')).rejects.toThrow('ai_provider_unavailable');
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['text','pdf','image','images'])('sends only to OpenRouter and retains 3.8 Flash: %s', async kind => {
  const fetch = vi.fn(async (url, init) => {
    expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(JSON.parse(init.body).model).toBe('google/gemini-3.8-flash');
    return new Response(JSON.stringify({choices:[{message:{content:'{}'},finish_reason:'stop'}],model:'google/gemini-3.8-flash'}),{status:200});
  }); vi.stubGlobal('fetch',fetch);
  expect((await invoke(kind,'offline-key')).provider).toBe('openrouter');
  expect(fetch).toHaveBeenCalledOnce();
});
it.each(['text','pdf','image','images'])('does not fall back to Gemini after OpenRouter rejects credentials: %s', async kind => {
  const fetch = vi.fn(async (url) => {
    expect(String(url)).toContain('openrouter.ai/');
    return new Response('invalid key',{status:401});
  }); vi.stubGlobal('fetch',fetch);
  await expect(invoke(kind,'offline-key')).rejects.toThrow('OpenRouter API error');
  expect(fetch).toHaveBeenCalledOnce();
});
