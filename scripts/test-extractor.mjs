import { fileURLToPath } from 'node:url';
import { startVitest } from 'vitest/node';

// Dedicated local checks avoid loading development proxies or paid AI evaluation.
const root = fileURLToPath(new URL('..', import.meta.url));
const ctx = await startVitest('test', process.argv.slice(2).length ? process.argv.slice(2) : [
  'api/_utils/callsheet', 'src/lib/ai', 'src/lib/callsheet',
  'src/components/trips/BulkUploadModal.import.test.tsx',
  'src/components/callsheets/CallsheetReviewSummary.test.tsx',
  'src/lib/aiJobCancellation.test.ts', 'src/components/trips/bulkUploadClose.test.ts',
  'src/lib/uploadFileName.test.ts', 'api/_utils/storageOwnership.test.ts',
  'src/lib/importDocuments.test.ts', 'src/contexts/TripsContext.test.tsx',
], {
  root, config: false, configFile: false, run: true, mode: 'test',
  environment: 'jsdom', setupFiles: [`${root}/src/test/setup.ts`],
  globals: true, css: false, restoreMocks: true, clearMocks: true,
  exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
}, { configFile: false, resolve: { alias: { '@': `${root}/src` } }, esbuild: { jsx: 'automatic' } });
await ctx?.close();
