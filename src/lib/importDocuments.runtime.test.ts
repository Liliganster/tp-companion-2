import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

it('loads shared document helpers with native Node ESM, as server functions do', () => {
  const dir = mkdtempSync(join(tmpdir(), 'callsheet-esm-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    for (const name of ['importDocuments', 'ui-language', 'i18n', 'i18n/es', 'i18n/en', 'i18n/de']) {
      const source = readFileSync(resolve('src/lib', name + '.ts'), 'utf8');
      const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
      const file = join(dir, name + '.js');
      mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, output);
    }
    writeFileSync(join(dir, 'check.mjs'), "import { MAX_DOCUMENT_BYTES, validateDocumentSize } from './importDocuments.js'; if (MAX_DOCUMENT_BYTES !== 52428800) throw Error('wrong limit'); validateDocumentSize({ name: 'document.pdf', size: 100 });");
    const result = spawnSync(process.execPath, [join(dir, 'check.mjs')], { encoding: 'utf8', timeout: 15000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  } finally {
    // Only this test's freshly created temporary directory is removed.
    rmSync(dir, { recursive: true, force: true });
  }
});
