import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteCompleteProject } from './deleteProject';
import { cascadeDeleteTripById } from './cascadeDelete';

function fixture() {
  const db: Record<string, any[]> = {
    projects: [{ id: 'p', name: 'Production', user_id: 'u' }, { id: 'other', name: 'Other', user_id: 'u' }],
    trips: [{ id: 't', user_id: 'u', project_id: 'p', callsheet_job_id: 'c', documents: [{ storagePath: 'u/trip.jpg', bucketId: 'project_documents' }] }],
    callsheet_jobs: [{ id: 'c', user_id: 'u', project_id: null, storage_path: 'u/c.pdf' }],
    invoice_jobs: [{ id: 'i', user_id: 'u', project_id: 'p', trip_id: null, storage_path: 'u/invoice.pdf' }],
    project_documents: [{ id: 'd', user_id: 'u', project_id: 'p', storage_path: 'u/contract.pdf' }, { id: 'keep', user_id: 'u', project_id: 'other', storage_path: 'u/keep.pdf' }],
    project_expenses: [{ id: 'e', user_id: 'u', project_id: 'p', receipts: [{ storagePath: 'u/receipt.jpg' }] }],
    reports: [{ id: 'r', user_id: 'u', trip_ids: ['t', 'keep-trip'] }],
  };
  const files = new Set(['callsheets:u/c.pdf', ...['trip.jpg', 'invoice.pdf', 'contract.pdf', 'receipt.jpg', 'keep.pdf'].map(p => `project_documents:u/${p}`)]);
  const controls = { failStorage: false, silentStorageFailure: false, failTable: '', failRead: '', maxPage: 100, onRemove: () => {} };
  const deletions: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u' } }, error: null }) },
    from(table: string) {
      let action = 'select', columns = '*', single = false, from = 0, to = Infinity, patch: any;
      const predicates: ((r: any) => boolean)[] = [];
      const builder: any = {
        select(c = '*') { columns = c; return builder; },
        eq(k: string, v: any) { predicates.push(r => typeof r[k] === 'object' ? JSON.stringify(r[k]) === v : r[k] === v); return builder; },
        in(k: string, ids: string[]) { predicates.push(r => ids.includes(r[k])); return builder; },
        order() { return builder; }, range(a: number, b: number) { from = a; to = Math.min(b, a + controls.maxPage - 1); return builder; },
        maybeSingle() { single = true; return builder; }, single() { single = true; return builder; },
        delete() { action = 'delete'; return builder; }, update(value: any) { action = 'update'; patch = value; return builder; },
        then(resolve: any, reject: any) {
          const matches = (r: any) => predicates.every(p => p(r));
          let rows = (db[table] || []).filter(matches).sort((a, b) => a.id.localeCompare(b.id));
          if ((action === 'delete' && controls.failTable === table) || (action === 'select' && controls.failRead === table)) return Promise.resolve({ error: new Error('offline') }).then(resolve, reject);
          if (action === 'delete') { deletions.push(table); db[table] = db[table].filter(r => !matches(r)); }
          if (action === 'update') rows.forEach(r => Object.assign(r, patch));
          const count = rows.length;
          rows = rows.slice(from, to + 1).map(r => columns === '*' ? { ...r } : Object.fromEntries(columns.split(',').map(k => k.trim().replace(/\(.*/, '')).map(k => [k, r[k]])));
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, count, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
    storage: { from: (bucket: string) => ({
      remove: async (paths: string[]) => {
        if (controls.failStorage) return { error: new Error('storage offline') };
        if (!controls.silentStorageFailure) paths.forEach(path => files.delete(`${bucket}:${path}`));
        controls.onRemove();
        return { error: null };
      },
      list: async (folder: string, opts: any) => ({ error: null, data: [...files].filter(f => f.startsWith(`${bucket}:${folder}/`))
        .map(f => ({ name: f.slice(`${bucket}:${folder}/`.length) })).filter(f => f.name.includes(opts.search))
        .slice(opts.offset, opts.offset + opts.limit) }),
    }) },
  } as unknown as SupabaseClient;
  return { client, db, files, controls, deletions };
}

it('removes trips, standalone invoices, project expense receipts and documents; keeps other projects', async () => {
  const f = fixture();
  await deleteCompleteProject(f.client, 'p');
  expect([...f.files]).toEqual(['project_documents:u/keep.pdf']);
  expect(f.db.projects.map(r => r.id)).toEqual(['other']);
  for (const table of ['trips', 'callsheet_jobs', 'invoice_jobs', 'project_expenses']) expect(f.db[table]).toEqual([]);
  expect(f.db.project_documents.map(r => r.id)).toEqual(['keep']);
  expect(f.db.reports[0].trip_ids).toEqual(['keep-trip']);
  expect(f.deletions.at(-1)).toBe('projects');
});
it.each(['failStorage', 'silentStorageFailure'] as const)('retains references and parent when %s prevents removing files', async failure => {
  const f = fixture(); f.controls[failure] = true;
  await expect(deleteCompleteProject(f.client, 'p')).rejects.toThrow();
  expect(f.deletions).toEqual([]);
  expect(f.db.projects).toHaveLength(2);
});
it('aborts before removing any files if inventory fails', async () => {
  const f = fixture(); f.controls.failRead = 'project_expenses';
  await expect(deleteCompleteProject(f.client, 'p')).rejects.toThrow();
  expect(f.files.size).toBe(6); expect(f.deletions).toEqual([]);
});
it('resumes after a row failure even though files were already removed', async () => {
  const f = fixture(); f.controls.failTable = 'invoice_jobs';
  await expect(deleteCompleteProject(f.client, 'p')).rejects.toThrow();
  expect(f.db.projects).toHaveLength(2);
  f.controls.failTable = '';
  await deleteCompleteProject(f.client, 'p');
  expect(f.db.projects.map(r => r.id)).toEqual(['other']);
});
it('reads all pages even when the server returns fewer rows than requested', async () => {
  const f = fixture(); f.controls.maxPage = 2;
  for (let i = 0; i < 205; i++) {
    f.db.project_documents.push({ id: `extra-${i}`, project_id: 'p', user_id: 'u', storage_path: `u/${i}.pdf` });
    f.files.add(`project_documents:u/${i}.pdf`);
  }
  await deleteCompleteProject(f.client, 'p');
  expect([...f.files]).toEqual(['project_documents:u/keep.pdf']);
  expect(f.db.project_documents).toHaveLength(1);
});
it('detects a new attachment during deletion and keeps its references for retry', async () => {
  const f = fixture(); let added = false;
  f.controls.onRemove = () => { if (!added) { added = true; f.db.project_documents.push({ id: 'new', project_id: 'p', user_id: 'u', storage_path: 'u/new.pdf' }); f.files.add('project_documents:u/new.pdf'); } };
  await expect(deleteCompleteProject(f.client, 'p')).rejects.toThrow('cambió');
  expect(f.deletions).toEqual([]);
  await deleteCompleteProject(f.client, 'p');
  expect(f.files.has('project_documents:u/new.pdf')).toBe(false);
});
it('does not remove a file that is also referenced by another project', async () => {
  const f = fixture(); f.db.project_documents[1].storage_path = 'u/invoice.pdf';
  await expect(deleteCompleteProject(f.client, 'p')).rejects.toThrow('compartidos');
  expect(f.files.size).toBe(6); expect(f.deletions).toEqual([]);
});
it('deleting the only trip still deletes its parent and all the parent attachments', async () => {
  const f = fixture();
  await cascadeDeleteTripById(f.client, 't');
  expect(f.db.projects.map(r => r.id)).toEqual(['other']);
  expect([...f.files]).toEqual(['project_documents:u/keep.pdf']);
});

it('includes legacy documents shown in the project by name, and invoices referenced by project documents', async () => {
  const f = fixture();
  f.db.callsheet_jobs.push({ id: 'legacy', user_id: 'u', project_id: null, storage_path: 'u/legacy.pdf', callsheet_results: [{ project_value: 'production' }] });
  f.db.invoice_jobs[0].project_id = null; f.db.project_documents[0].invoice_job_id = 'i';
  f.files.add('callsheets:u/legacy.pdf');
  await deleteCompleteProject(f.client, 'p');
  expect([...f.files]).toEqual(['project_documents:u/keep.pdf']);
  expect(f.db.invoice_jobs).toEqual([]); expect(f.db.callsheet_jobs).toEqual([]);
});
