import { createContext, ReactNode, useCallback, useContext, useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { useTrips } from "./TripsContext";

export type OdometerSnapshot = {
  id: string;
  user_id: string;
  snapshot_date: string; // YYYY-MM-DD
  reading_km: number;
  source: "itv" | "taller" | "seguro" | "manual" | string;
  image_storage_path: string | null;
  extraction_status: "ai" | "manual" | "failed" | "user_edited" | null;
  /** Free-text justification written by the user when correcting an AI value. */
  user_correction_note?: string | null;
  created_at: string;
};

export type OdometerRatio = {
  startSnapshot: OdometerSnapshot;
  endSnapshot: OdometerSnapshot;
  totalKm: number;
  workKm: number;
  privateKm: number;
  pct: number; // work usage percentage 0–100
};

type OdometerContextValue = {
  snapshots: OdometerSnapshot[];
  loading: boolean;
  /** Insert a new snapshot. Returns the new row id, or null on failure. */
  addSnapshot: (data: Omit<OdometerSnapshot, "id" | "user_id" | "created_at">) => Promise<string | null>;
  /** Update extraction_status, optionally reading_km, and optionally a user correction note. */
  updateSnapshotExtraction: (id: string, readingKm: number | null, status: "ai" | "manual" | "failed" | "user_edited", correctionNote?: string | null) => Promise<void>;
  /** Delete a snapshot and its associated photo from storage. */
  deleteSnapshot: (id: string) => Promise<void>;
  /**
   * Compute work vs private km ratio for the given year.
   * Uses the two snapshots that bracket the year (earliest before/at year-end,
   * latest at/after year-start). Returns null if < 2 distinct snapshots exist.
   */
  computeRatio: (year: number) => OdometerRatio | null;
  /** Get a signed (or public) URL for a storage path. */
  getImageUrl: (storagePath: string) => Promise<string | null>;
  /** Reload snapshots from Supabase. */
  refresh: () => Promise<void>;
};

const OdometerContext = createContext<OdometerContextValue | null>(null);

export function OdometerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { trips } = useTrips();
  const [snapshots, setSnapshots] = useState<OdometerSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSnapshots = useCallback(async () => {
    if (!user?.id || !supabase) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("odometer_snapshots")
        .select("*")
        .eq("user_id", user.id)
        .or("reading_km.gt.0,extraction_status.eq.failed") // excludes empty draft rows
        .order("snapshot_date", { ascending: true });
      if (!error && data) {
        setSnapshots(data as OdometerSnapshot[]);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void fetchSnapshots(); }, [fetchSnapshots]);

  const addSnapshot = useCallback(async (
    data: Omit<OdometerSnapshot, "id" | "user_id" | "created_at">
  ): Promise<string | null> => {
    if (!user?.id || !supabase) return null;
    const { data: inserted, error } = await supabase
      .from("odometer_snapshots")
      .insert({ ...data, user_id: user.id })
      .select()
      .single();
    if (error || !inserted) { console.error('DB Insert error:', error); return null; }
    const newSnap = inserted as OdometerSnapshot;
    setSnapshots((prev) =>
      [...prev, newSnap].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    );
    return newSnap.id;
  }, [user?.id]);

  const updateSnapshotExtraction = useCallback(async (
    id: string,
    readingKm: number | null,
    status: "ai" | "manual" | "failed" | "user_edited",
    correctionNote?: string | null
  ) => {
    if (!supabase) return;
    const patch: Record<string, unknown> = { extraction_status: status };
    if (readingKm !== null) patch.reading_km = readingKm;
    if (correctionNote !== undefined) patch.user_correction_note = correctionNote;
    const { data } = await supabase
      .from("odometer_snapshots")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (data) {
      const updated = data as OdometerSnapshot;
      setSnapshots((prev) =>
        prev.map((s) => (s.id === id ? updated : s))
      );
    }
  }, []);

  const deleteSnapshot = useCallback(async (id: string) => {
    if (!supabase) return;
    const snap = snapshots.find((s) => s.id === id);
    // Remove the photo from storage first (best-effort)
    if (snap?.image_storage_path) {
      await supabase.storage.from("odometer-images").remove([snap.image_storage_path]);
    }
    await supabase.from("odometer_snapshots").delete().eq("id", id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, [snapshots]);

  const computeRatio = useCallback((year: number): OdometerRatio | null => {
    if (snapshots.length < 2) return null;

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    // The "start" snapshot: nearest snapshot before or on the year-end
    const candidatesStart = snapshots.filter((s) => s.snapshot_date <= yearEnd);
    // The "end" snapshot: nearest snapshot after or on the year-start
    const candidatesEnd = snapshots.filter((s) => s.snapshot_date >= yearStart);

    if (candidatesStart.length === 0 || candidatesEnd.length === 0) return null;

    const startSnap = candidatesStart[0]; // earliest within range
    const endSnap = candidatesEnd[candidatesEnd.length - 1]; // latest within range

    if (startSnap.id === endSnap.id) return null;
    if (startSnap.reading_km >= endSnap.reading_km) return null;

    const totalKm = endSnap.reading_km - startSnap.reading_km;

    // Work km = trips within the snapshot period
    const workKm = trips
      .filter((t) => t.date >= startSnap.snapshot_date && t.date <= endSnap.snapshot_date)
      .reduce((sum, t) => sum + (t.distance || 0), 0);

    const privateKm = Math.max(0, totalKm - workKm);
    const pct = totalKm > 0 ? Math.min(100, Math.max(0, (workKm / totalKm) * 100)) : 0;

    return { startSnapshot: startSnap, endSnapshot: endSnap, totalKm, workKm, privateKm, pct };
  }, [snapshots, trips]);

  const getImageUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    if (!supabase) return null;
    // Use signed URL (60 min) since the bucket is private
    const { data, error } = await supabase.storage
      .from("odometer-images")
      .createSignedUrl(storagePath, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }, []);

  const value = useMemo<OdometerContextValue>(() => ({
    snapshots,
    loading,
    addSnapshot,
    updateSnapshotExtraction,
    deleteSnapshot,
    computeRatio,
    getImageUrl,
    refresh: fetchSnapshots,
  }), [
    snapshots, loading, addSnapshot, updateSnapshotExtraction,
    deleteSnapshot, computeRatio, getImageUrl, fetchSnapshots,
  ]);

  return <OdometerContext.Provider value={value}>{children}</OdometerContext.Provider>;
}

export function useOdometer() {
  const ctx = useContext(OdometerContext);
  if (!ctx) throw new Error("useOdometer must be used within OdometerProvider");
  return ctx;
}
