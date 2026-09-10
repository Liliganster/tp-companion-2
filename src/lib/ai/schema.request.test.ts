import { afterEach, expect, it, vi } from 'vitest';
import { GoogleGenerativeAI, type Schema } from '@google/generative-ai';
import { extractionSchema } from './schema';

// Validate schema keywords in the actual serialized SDK request, not just
// mocked extraction results. Domain field names are allowed inside properties.
function invalidSchemaKeys(node: Record<string, unknown>): string[] {
  const allowed = new Set(['type', 'description', 'enum', 'properties', 'items', 'required']);
  return [
    ...Object.keys(node).filter(key => !allowed.has(key)),
    ...Object.values((node.properties ?? {}) as Record<string, Record<string, unknown>>).flatMap(invalidSchemaKeys),
    ...(node.items ? invalidSchemaKeys(node.items as Record<string, unknown>) : []),
  ];
}
afterEach(() => vi.unstubAllGlobals());
it('sends a valid nested response schema through the Gemini SDK', async () => {
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const invalid = invalidSchemaKeys(body.generationConfig.responseSchema);
    if (invalid.length) return new Response(JSON.stringify({ error: { message: `Unknown schema fields: ${invalid.join(', ')}` } }), { status: 400 });
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '{}' }] } }] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  const model = new GoogleGenerativeAI('mock-key-no-network').getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json', responseSchema: extractionSchema as unknown as Schema } });
  await expect(model.generateContent([{ inlineData: { data: 'JVBERg==', mimeType: 'application/pdf' } }, 'Mock callsheet'])).resolves.toBeDefined();
  expect(fetch).toHaveBeenCalledOnce();
});
