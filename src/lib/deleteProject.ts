import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, any>;
type FileRef = { bucket: string; path: string };
const PAGE = 100;

async function readAll(client: SupabaseClient, table: string, columns: string, userId: string) {
  const rows: Row[] = [];
  for (;;) {
    const { data, error } = await client.from(table).select(columns).eq('user_id', userId)
      .order('id').range(rows.length, rows.length + PAGE - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('No se pudo comprobar el contenido del proyecto.');
    if (!data.length) return rows;
    rows.push(...data);
  }
}

function attachments(value: unknown, defaultBucket: string): FileRef[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('No se pudieron comprobar los documentos asociados.');
  return value.flatMap((doc: Row) => {
    const path = doc?.storagePath ?? doc?.path;
    if (!path) return []; // Client metadata is not an uploaded file.
    if (typeof path !== 'string' || !path.split('/').every(p => p && p !== '.' && p !== '..')) {
      throw new Error('Un documento tiene una ruta no válida. No se ha completado el borrado.');
    }
    const bucket = doc.bucketId || defaultBucket;
    if (!['callsheets', 'project_documents'].includes(bucket)) throw new Error('No se reconoce el almacenamiento de un documento.');
    return [{ bucket, path }];
  });
}

async function inventory(client: SupabaseClient, userId: string, projectId: string, projectName: string) {
  const [trips, callsheets, invoices, documents, expenses, projects] = await Promise.all([
    readAll(client, 'trips', 'id,project_id,documents,callsheet_job_id,invoice_job_id', userId),
    readAll(client, 'callsheet_jobs', 'id,project_id,storage_path,callsheet_results(project_value)', userId),
    readAll(client, 'invoice_jobs', 'id,project_id,trip_id,storage_path', userId),
    readAll(client, 'project_documents', 'id,project_id,trip_id,invoice_job_id,storage_path', userId),
    readAll(client, 'project_expenses', 'id,project_id,receipts', userId),
    readAll(client, 'projects', 'id,name', userId),
  ]);
  const nameMatches = (value: unknown) => Boolean(projectName) && typeof value === 'string' && value.trim().toLowerCase() === projectName.trim().toLowerCase();
  const legacyTrips = trips.filter(r => !r.project_id && Array.isArray(r.documents) && r.documents.some((d: Row) => d.kind === 'client_meta' && nameMatches(d.name)));
  const legacyCalls = callsheets.filter(r => !r.project_id &&
    (Array.isArray(r.callsheet_results) ? r.callsheet_results : [r.callsheet_results]).some((result: Row) => nameMatches(result?.project_value)) &&
    !trips.some(t => t.callsheet_job_id === r.id && t.project_id && t.project_id !== projectId));
  if ((legacyTrips.length || legacyCalls.length) && projects.filter(p => nameMatches(p.name)).length !== 1) {
    throw new Error('Hay proyectos con el mismo nombre y documentos antiguos sin vínculo. Asócialos antes de borrar el proyecto.');
  }
  const selectedTrips = trips.filter(r => r.project_id === projectId || legacyTrips.includes(r));
  const tripIds = new Set(selectedTrips.map(r => r.id));
  const callIds = new Set(selectedTrips.map(r => r.callsheet_job_id).filter(Boolean));
  const invoiceIds = new Set(selectedTrips.map(r => r.invoice_job_id).filter(Boolean));
  documents.filter(r => r.project_id === projectId || tripIds.has(r.trip_id)).forEach(r => { if (r.invoice_job_id) invoiceIds.add(r.invoice_job_id); });
  const selectedCalls = callsheets.filter(r => r.project_id === projectId || callIds.has(r.id) || legacyCalls.includes(r));
  const selectedInvoices = invoices.filter(r => r.project_id === projectId || tripIds.has(r.trip_id) || invoiceIds.has(r.id));
  selectedCalls.forEach(r => callIds.add(r.id));
  selectedInvoices.forEach(r => invoiceIds.add(r.id));
  const selectedDocs = documents.filter(r => r.project_id === projectId || tripIds.has(r.trip_id) || invoiceIds.has(r.invoice_job_id));
  const selectedExpenses = expenses.filter(r => r.project_id === projectId);
  // Stop on inconsistent/shared links instead of damaging another project.
  if (trips.some(r => !tripIds.has(r.id) && (callIds.has(r.callsheet_job_id) || invoiceIds.has(r.invoice_job_id))) ||
    [...selectedCalls, ...selectedInvoices, ...selectedDocs].some(r => r.project_id && r.project_id !== projectId) ||
    selectedInvoices.some(r => r.trip_id && !tripIds.has(r.trip_id))) {
    throw new Error('Hay documentos compartidos con otro proyecto. Revisa sus vínculos antes de eliminarlo.');
  }
  const rows = { trips: selectedTrips, callsheet_jobs: selectedCalls, invoice_jobs: selectedInvoices,
    project_documents: selectedDocs, project_expenses: selectedExpenses };
  const fileRefs = (group: typeof rows) => [
    ...group.trips.flatMap(r => attachments(r.documents, 'callsheets')),
    ...group.project_expenses.flatMap(r => attachments(r.receipts, 'project_documents')),
    ...group.callsheet_jobs.flatMap(r => r.storage_path ? [{ bucket: 'callsheets', path: r.storage_path }] : []),
    ...[...group.invoice_jobs, ...group.project_documents].flatMap(r => r.storage_path ? [{ bucket: 'project_documents', path: r.storage_path }] : []),
  ];
  const key = (f: FileRef) => JSON.stringify([f.bucket, f.path]);
  const files = [...new Map(fileRefs(rows).map(f => [key(f), f])).values()];
  const others = fileRefs({ trips: trips.filter(r => !tripIds.has(r.id)),
    callsheet_jobs: callsheets.filter(r => !callIds.has(r.id)), invoice_jobs: invoices.filter(r => !invoiceIds.has(r.id)),
    project_documents: documents.filter(r => !selectedDocs.some(d => d.id === r.id)),
    project_expenses: expenses.filter(r => r.project_id !== projectId) });
  const shared = new Set(others.map(key));
  if (files.some(f => shared.has(key(f)))) throw new Error('Hay archivos compartidos con otro proyecto. No se ha completado el borrado.');
  return { rows, files };
}

async function verifyAbsent(client: SupabaseClient, file: FileRef) {
  const slash = file.path.lastIndexOf('/');
  const folder = slash < 0 ? '' : file.path.slice(0, slash);
  const name = file.path.slice(slash + 1);
  for (let offset = 0;;) {
    const { data, error } = await client.storage.from(file.bucket).list(folder, { search: name, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('No se pudo comprobar el borrado de un archivo.');
    if (data.some(row => row.name === name)) throw new Error('Quedan archivos sin eliminar. Vuelve a intentar el borrado del proyecto.');
    if (!data.length) return;
    offset += data.length;
  }
}

/** Preserve the inventory until all files are removed; delete the parent last. */
export async function deleteCompleteProject(client: SupabaseClient, projectId: string) {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw authError ?? new Error('La sesión no es válida.');
  const userId = auth.user.id;
  try {
    for (const kind of ['projects', 'trips', 'reports']) localStorage.removeItem(`cache:${kind}:v1:${userId}`);
  } catch { /* Storage can be unavailable in private browsing. */ }
  const project = await client.from('projects').select('id,name').eq('id', projectId).eq('user_id', userId).maybeSingle();
  if (project.error) throw project.error;
  if (!project.data) return;
  const projectName = typeof project.data.name === 'string' ? project.data.name : '';
  const before = await inventory(client, userId, projectId, projectName);
  const reports = await readAll(client, 'reports', 'id,trip_ids', userId);
  for (const report of reports) {
    report.trip_ids ??= [];
    if (!Array.isArray(report.trip_ids)) throw new Error('No se pudieron comprobar los viajes del informe.');
  }
  for (const bucket of ['callsheets', 'project_documents']) {
    const paths = before.files.filter(f => f.bucket === bucket).map(f => f.path);
    for (let offset = 0; offset < paths.length; offset += PAGE) {
      const { error } = await client.storage.from(bucket).remove(paths.slice(offset, offset + PAGE));
      if (error) throw error;
    }
  }
  for (const file of before.files) await verifyAbsent(client, file);
  // Detect new uploads/edits during the file phase before removing their references.
  const current = await inventory(client, userId, projectId, projectName);
  if (JSON.stringify(before) !== JSON.stringify(current)) throw new Error('El contenido del proyecto cambió durante el borrado. Vuelve a intentarlo.');
  const tripIds = new Set(before.rows.trips.map(r => r.id));
  for (const report of reports) {
    if (!Array.isArray(report.trip_ids)) throw new Error('No se pudieron comprobar los viajes del informe.');
    const next = report.trip_ids.filter((id: string) => !tripIds.has(id));
    if (next.length === report.trip_ids.length) continue;
    const result = await client.from('reports').update({ trip_ids: next }).eq('id', report.id).eq('user_id', userId)
      .eq('trip_ids', JSON.stringify(report.trip_ids)).select('id').single();
    if (result.error || !result.data) throw result.error ?? new Error('El informe cambió durante el borrado. Vuelve a intentarlo.');
  }
  // Children with job_id are removed by the existing database FK cascades.
  for (const table of ['project_documents', 'project_expenses', 'invoice_jobs', 'callsheet_jobs', 'trips'] as const) {
    const ids = before.rows[table].map(r => r.id);
    for (let offset = 0; offset < ids.length; offset += PAGE) {
      const result = await client.from(table).delete().in('id', ids.slice(offset, offset + PAGE)).eq('user_id', userId);
      if (result.error) throw result.error;
    }
  }
  const remaining = await inventory(client, userId, projectId, projectName);
  if (Object.values(remaining.rows).some(rows => rows.length)) throw new Error('Quedan datos en el proyecto. Vuelve a intentar el borrado.');
  const result = await client.from('projects').delete().eq('id', projectId).eq('user_id', userId).select('id').single();
  if (result.error || !result.data) throw result.error ?? new Error('No se pudo eliminar el proyecto.');
}
