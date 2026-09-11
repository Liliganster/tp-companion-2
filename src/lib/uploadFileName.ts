// User-visible filenames are distinct from Storage keys and URL paths.
export function isSupportedUploadFileName(name: string): boolean {
  return Boolean(name.trim()) && name !== "." && name !== ".." &&
    !/[\\/]/.test(name) &&
    !Array.from(name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

const PREFIX = '__csn1__';

/** Reversible ASCII key; retains the extension for MIME inference, without collisions from replacing # with _. */
export function toStorageFileName(name: string): string {
  if (!isSupportedUploadFileName(name)) throw new Error('invalid_filename');
  if (/^[a-zA-Z0-9_. ()-]+$/.test(name) && name === name.trim() && !name.startsWith(PREFIX)) return name;
  const bytes = new TextEncoder().encode(name);
  const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const extension = name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '';
  return `${PREFIX}${encoded}${extension}`;
}

/** Display/export only. Authorization, download and delete must use the stored key unchanged. */
export function getUploadedFileName(path: string): string {
  const stored = path.split('/').pop() || '';
  if (!stored.startsWith(PREFIX)) return stored;
  const encoded = stored.slice(PREFIX.length).split('.')[0];
  if (!/^[a-zA-Z0-9_-]+$/.test(encoded)) return stored;
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return isSupportedUploadFileName(name) && toStorageFileName(name) === stored ? name : stored;
  } catch { return stored; }
}
