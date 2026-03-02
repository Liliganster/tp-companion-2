import { supabase } from "@/lib/supabaseClient";
import type { Trip } from "@/contexts/TripsContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportTrip {
  id: string;
  date: string;
  route: string[];
  project: string;
  projectId?: string | null;
  callsheet_job_id?: string;
  documents?: Trip["documents"];
}

interface DocEntry {
  /** Path inside the ZIP, e.g. docs/ProjectA/viaje_2024-01-10_Madrid-Valencia/callsheet.pdf */
  zipPath: string;
  /** Supabase storage bucket */
  bucket: string;
  /** Storage path within the bucket */
  storagePath: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sanitize = (value: string, maxLen = 60) =>
  value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/, "")
    .slice(0, maxLen) || "unknown";

const tripFolderName = (trip: ExportTrip): string => {
  const date = trip.date ? trip.date.slice(0, 10) : "sin_fecha";
  const routeShort =
    trip.route.length >= 2
      ? `${sanitize(trip.route[0], 25)}-${sanitize(trip.route[trip.route.length - 1], 25)}`
      : sanitize(trip.route[0] ?? "ruta", 40);
  return `viaje_${date}_${routeShort}`;
};

// ---------------------------------------------------------------------------
// Core: Collect all docs to include in ZIP
// ---------------------------------------------------------------------------

async function collectDocs(
  trips: ExportTrip[],
  projectIds: string[],
): Promise<DocEntry[]> {
  const entries: DocEntry[] = [];
  const seen = new Set<string>();

  // Group trips by project name for folder naming
  const tripsByProject = new Map<string, ExportTrip[]>();
  for (const trip of trips) {
    const key = trip.project || "Sin_proyecto";
    if (!tripsByProject.has(key)) tripsByProject.set(key, []);
    tripsByProject.get(key)!.push(trip);
  }

  // 1) Trip-level documents (stored in trip.documents[])
  for (const [projectName, projectTrips] of tripsByProject.entries()) {
    const pFolder = sanitize(projectName, 60);
    for (const trip of projectTrips) {
      const tFolder = tripFolderName(trip);
      const base = `docs/${pFolder}/${tFolder}/`;

      // a) Callsheet linked to trip via callsheet_job_id
      if (trip.callsheet_job_id) {
        const { data: job } = await supabase
          .from("callsheet_jobs")
          .select("storage_path")
          .eq("id", trip.callsheet_job_id)
          .maybeSingle();

        const sp = String(job?.storage_path ?? "").trim();
        if (sp && sp !== "pending" && !seen.has(sp)) {
          seen.add(sp);
          const fileName = sp.split("/").pop() || "callsheet";
          entries.push({ zipPath: base + fileName, bucket: "callsheets", storagePath: sp });
        }
      }

      // b) Documents embedded in the trip JSON (receipts, invoices, etc.)
      for (const doc of trip.documents ?? []) {
        const sp = String(doc?.storagePath ?? "").trim();
        if (!sp || seen.has(sp)) continue;
        seen.add(sp);
        const bucket = doc.bucketId ?? "project_documents";
        const fileName = doc.name || sp.split("/").pop() || "documento";
        entries.push({ zipPath: base + sanitize(fileName), bucket, storagePath: sp });
      }
    }
  }

  // 2) Project-level documents from project_documents table (not tied to a specific trip)
  if (projectIds.length > 0) {
    const { data: projDocs } = await supabase
      .from("project_documents")
      .select("name, storage_path, project_id")
      .in("project_id", projectIds);

    // Build a map projectId → projectName using the trips we have
    const pidToName = new Map<string, string>();
    for (const trip of trips) {
      if (trip.projectId) pidToName.set(trip.projectId, trip.project);
    }

    for (const doc of projDocs ?? []) {
      const sp = String(doc.storage_path ?? "").trim();
      if (!sp || seen.has(sp)) continue;
      seen.add(sp);

      const projectName = pidToName.get(doc.project_id) || "proyecto";
      const pFolder = sanitize(projectName, 60);
      const fileName = doc.name || sp.split("/").pop() || "documento";
      entries.push({
        zipPath: `docs/${pFolder}/_documentos_generales/${sanitize(fileName)}`,
        bucket: "project_documents",
        storagePath: sp,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Core: Download a single file blob via Supabase signed URL
// ---------------------------------------------------------------------------

async function downloadBlob(bucket: string, storagePath: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 120); // 2-min TTL

  if (error || !data?.signedUrl) return null;

  try {
    const response = await fetch(data.signedUrl);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildZipOptions {
  /** The report PDF blob to include at the root of the ZIP */
  reportBlob: Blob;
  reportFileName: string;
  /** Trips that appear in the report */
  trips: ExportTrip[];
  /** Called to report progress: 0–1 */
  onProgress?: (ratio: number) => void;
}

export async function buildProjectZip(options: BuildZipOptions): Promise<Blob> {
  const { reportBlob, reportFileName, trips, onProgress } = options;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // Add the report at the root
  zip.file(reportFileName, reportBlob);

  // Collect unique project IDs from trips
  const projectIds = Array.from(
    new Set(trips.map((t) => t.projectId).filter((id): id is string => Boolean(id))),
  );

  const docs = await collectDocs(trips, projectIds);

  // Download all document blobs with concurrency limit of 4
  const CONCURRENCY = 4;
  let completed = 0;

  const processChunk = async (chunk: DocEntry[]) => {
    await Promise.all(
      chunk.map(async (entry) => {
        const blob = await downloadBlob(entry.bucket, entry.storagePath);
        if (blob) {
          zip.file(entry.zipPath, blob);
        }
        completed++;
        onProgress?.(completed / docs.length);
      }),
    );
  };

  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    await processChunk(docs.slice(i, i + CONCURRENCY));
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
