import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadCallsheetFile } from './callsheetUpload';
import { getReviewCallsheetDrafts } from './callsheetReview';
import { getUploadedFileName } from './uploadFileName';
import { uploadSignedCallsheet, finalizeCallsheetUpload, recordCallsheetUploadFailure } from './callsheetUploadTransport';
vi.mock('./callsheetUploadTransport', () => ({ uploadSignedCallsheet: vi.fn(), finalizeCallsheetUpload: vi.fn(), recordCallsheetUploadFailure: vi.fn() }));

function backend() {
  const jobs = new Map<string, any>();
  const files = new Set<string>();
  const deleted = vi.fn();
  const client = {
    from: () => {
      let patch: any;
      const filters: ((row: any) => boolean)[] = [];
      const query: any = {
        insert: (value: any) => { patch = value; return query; },
        update: (value: any) => { patch = value; return query; },
        eq: (key: string, value: any) => { filters.push(row => row[key] === value); return query; },
        in: (key: string, values: any[]) => { filters.push(row => values.includes(row[key])); return query; },
        select: () => query, single: () => query, delete: deleted,
        then: (resolve: any) => {
          if (patch.id) jobs.set(patch.id, { ...patch, created_at: '2026-09-11T00:00:00Z' });
          else for (const row of jobs.values()) if (filters.every(fn => fn(row))) {
            if (row.id === 'queue-error' && patch.status === 'queued') return Promise.resolve({ error: { message: 'Queue unavailable' } }).then(resolve);
            Object.assign(row, patch);
          }
          return Promise.resolve({ data: { id: patch.id }, error: null }).then(resolve);
        },
      };
      return query;
    },
    storage: { from: () => ({ remove: deleted, upload: async (path: string) => {
      if (path.includes('/upload-error/')) return { error: { message: 'Upload unavailable' } };
      files.add(path); return { error: null };
    } }) },
  } as unknown as SupabaseClient;
  vi.mocked(uploadSignedCallsheet).mockImplementation(async (_client, _id, _name, path) => {
    const result = await client.storage.from('callsheets').upload(path, new Blob());
    if (result.error) throw result.error;
  });
  vi.mocked(finalizeCallsheetUpload).mockImplementation(async (_client, id, _size, enqueue = true) => {
    const result = await client.from('callsheet_jobs').update({ status: enqueue ? 'queued' : 'created' }).eq('id', id);
    if (result.error) throw result.error;
    return { ok: true };
  });
  vi.mocked(recordCallsheetUploadFailure).mockImplementation(async (_client, id, reason) => {
    await client.from('callsheet_jobs').update({ status: 'failed', needs_review_reason: reason }).eq('id', id).eq('status', 'created');
  });
  return { client, jobs, files, deleted };
}

it('retains all four files when one upload and one queue operation fail, including after reload', async () => {
  const db = backend();
  const ids = ['ok-1', 'upload-error', 'queue-error', 'ok-2'];
  const results = await Promise.all(ids.map(id => uploadCallsheetFile(db.client, 'user', new File(['PDF'], `${id}.pdf`), id)));
  expect(results.map(r => r.status)).toEqual(['queued', 'failed', 'failed', 'queued']);
  expect(results.filter(r => r.status === 'queued').map(r => r.id)).toEqual(['ok-1', 'ok-2']);
  expect(db.jobs.size).toBe(4);
  expect(db.files.size).toBe(3);
  expect(db.jobs.get('queue-error').storage_path).toBe('user/queue-error/queue-error.pdf');
  const restored = getReviewCallsheetDrafts(JSON.parse(JSON.stringify([...db.jobs.values()])), [], []);
  expect(restored.map(d => d.name).sort()).toEqual(ids.map(id => `${id}.pdf`).sort());
  expect(restored.find(d => d.job.id === 'upload-error')?.job.needs_review_reason).toContain('No se pudo subir');
  expect(db.deleted).not.toHaveBeenCalled();
});

it('keeps a named failure in the current batch even if the job insert fails', async () => {
  const client = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ error: { message: 'Database unavailable' } }) }) }) }) } as unknown as SupabaseClient;
  const result = await uploadCallsheetFile(client, 'user', new File(['PDF'], 'Dispo.pdf'), 'id');
  expect(result).toMatchObject({ id: 'id', storagePath: 'user/id/Dispo.pdf', status: 'failed', persisted: false, uploaded: false });
});

it('uploads a callsheet with # and recovers its original name after reload', async () => {
  const db = backend();
  const result = await uploadCallsheetFile(db.client, 'user', new File(['PDF'], 'Callsheet #25.pdf'), 'hash-name');
  expect(result.status).toBe('queued');
  expect(db.files.has(result.storagePath)).toBe(true);
  expect(result.storagePath).not.toContain('#');
  expect(getUploadedFileName(result.storagePath)).toBe('Callsheet #25.pdf');
  const [draft] = getReviewCallsheetDrafts(JSON.parse(JSON.stringify([...db.jobs.values()])), [], []);
  expect(draft.name).toBe('Callsheet #25.pdf');
  expect(draft.trip.documents?.[0]).toMatchObject({ name: 'Callsheet #25.pdf', storagePath: result.storagePath });
});

it('retains a registered file when the user closes while its upload completes', async () => {
  const db = backend();
  const result = await uploadCallsheetFile(db.client, 'user', new File(['PDF'], 'Dispo.pdf'), 'interrupted', () => db.files.size > 0);
  expect(result.status).toBe('failed');
  expect(db.files.has(result.storagePath)).toBe(true);
  expect(db.jobs.get('interrupted').status).toBe('failed');
  expect(db.deleted).not.toHaveBeenCalled();
});

it('preserves a local read failure without uploading or queuing an extraction', async () => {
  const db = backend();
  vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(() => { throw new DOMException('File unavailable', 'NotReadableError'); });
  const result = await uploadCallsheetFile(db.client, 'user', new File(['PDF'], '#49.pdf'), 'unreadable');
  expect(result).toMatchObject({ persisted: true, uploaded: false, status: 'failed' });
  expect(result.reason).toContain('No se pudo leer el archivo');
  expect(db.files.size).toBe(0);
  expect(db.jobs.get('unreadable').status).toBe('failed');
});

it('supports project uploads without starting extraction or deleting failed evidence', async () => {
  const db = backend();
  const result = await uploadCallsheetFile(db.client, 'user', new File(['PDF'], 'Dispo.pdf'), 'manual', () => false, { projectId: 'project', autoQueue: false });
  expect(result.status).toBe('created');
  expect(db.jobs.get('manual')).toMatchObject({ project_id: 'project', status: 'created' });
  expect(db.deleted).not.toHaveBeenCalled();
});
