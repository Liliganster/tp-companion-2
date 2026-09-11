import { expect, it, vi } from 'vitest';
vi.mock('../../src/lib/supabaseServer.js', () => ({ supabaseAdmin: {} }));
import { getUploadedFileName, isSupportedUploadFileName, toStorageFileName } from './uploadFileName';
import { isSafeStoragePath } from '../../api/_utils/storageOwnership';

it.each(['Dispo #25.pdf', 'Dispo ##25.PDF', 'Drehplan #1 – München.pdf', '100% final?.pdf', ' document.pdf', '__csn1__literal.pdf'])('keeps the original name %s while using a safe storage key', name => {
  expect(isSupportedUploadFileName(name)).toBe(true);
  const key = `user/job/${toStorageFileName(name)}`;
  expect(isSafeStoragePath(key)).toBe(true);
  expect(getUploadedFileName(key)).toBe(name);
  expect(key.split('.').pop()).toBe(name.split('.').pop());
});
it('does not merge different names or change existing plain keys', () => {
  const names = ['Dispo #25.pdf', 'Dispo _25.pdf', 'Dispo 25.pdf', 'Dispo %2325.pdf'];
  expect(new Set(names.map(toStorageFileName)).size).toBe(names.length);
  expect(toStorageFileName('Dispo 25.pdf')).toBe('Dispo 25.pdf');
  expect(getUploadedFileName('legacy/Dispo #25.pdf')).toBe('Dispo #25.pdf');
  expect(getUploadedFileName('legacy/__csn1__broken.pdf')).toBe('__csn1__broken.pdf');
});
it.each(['../file.pdf', 'folder/file.pdf', 'folder\\file.pdf', '.', '..', '\u0000.pdf'])('rejects a path or control character as filename: %j', name => {
  expect(isSupportedUploadFileName(name)).toBe(false);
  expect(() => toStorageFileName(name)).toThrow('invalid_filename');
});
