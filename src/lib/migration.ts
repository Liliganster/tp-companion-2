import { supabase } from "@/lib/supabaseClient";
import { Trip } from "@/contexts/TripsContext";
import { Project } from "@/contexts/ProjectsContext";
import { SavedReport } from "@/contexts/ReportsContext";
import { UserProfile } from "@/contexts/UserProfileContext";

const KEYS = {
  PROFILE: "user-profile",
  PROJECTS: "projects",
  TRIPS: "trips",
  REPORTS: "reports",
  MIGRATED: "migration-completed-v1"
};

type MigrationResult =
  | { ok: true; migrated: { projects: number; trips: number; reports: number; profile: boolean } }
  | { ok: false; reason: "supabase-not-configured" | "no-local-data" | "failed"; error?: string };

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeUuid() {
  try {
    return crypto.randomUUID();
  } catch {
    // Very unlikely in modern browsers, but keep a fallback.
    return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}
function parseLocaleFloat(value: unknown): number | null {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}


export async function checkAndMigrateData(userId: string): Promise<MigrationResult> {
  if (typeof window === "undefined") return;

  if (!supabase) {
    return { ok: false, reason: "supabase-not-configured" };
  }
  
  const isMigrated = localStorage.getItem(KEYS.MIGRATED);
  if (isMigrated) return { ok: true, migrated: { projects: 0, trips: 0, reports: 0, profile: false } };

  const rawProfile = localStorage.getItem(KEYS.PROFILE);
  const rawProjects = localStorage.getItem(KEYS.PROJECTS);
  const rawTrips = localStorage.getItem(KEYS.TRIPS);
  const rawReports = localStorage.getItem(KEYS.REPORTS);

  if (!rawProfile && !rawProjects && !rawTrips && !rawReports) {
    localStorage.setItem(KEYS.MIGRATED, "true");
    return { ok: false, reason: "no-local-data" };
  }

  try {
    let migratedProfile = false;
    let migratedProjects = 0;
    let migratedTrips = 0;
    let migratedReports = 0;

    // 1. Migrate Profile
    if (rawProfile) {
      const profile = JSON.parse(rawProfile) as UserProfile;
      const { error: profileError } = await supabase.from("user_profiles").upsert({
        id: userId,
        full_name: profile.fullName,
        vat_id: profile.vatId,
        license_plate: profile.licensePlate,
        base_address: profile.baseAddress,
        city: profile.city,
        country: profile.country,
        // image_url: profile.imageUrl, // Not in UserProfile type
        rate_per_km: parseLocaleFloat(profile.ratePerKm),
        passenger_surcharge: parseLocaleFloat(profile.passengerSurcharge),
        currency: "EUR", // Default
        language: profile.language,
        // theme: profile.theme, // Not in UserProfile type
        // calendar_enabled: profile.calendarEnabled, // Not in UserProfile type
        // email_notifications: profile.emailNotifications, // Not in UserProfile type
        // marketing_emails: profile.marketingEmails // Not in UserProfile type
      }, { onConflict: "id" });
      if (profileError) throw new Error(`Profile migration failed: ${profileError.message}`);
      migratedProfile = true;
    }

    // 2. Migrate Projects
    const projectMap = new Map<string, string>(); // normalized old name -> project UUID
    if (rawProjects) {
        const projects = JSON.parse(rawProjects) as Project[];
        for (const p of projects) {
          // Projects might already exist if sync happened partially? 
          // For simplicity, we insert if not exists by name? Or just blind insert?
          // RLS protects us. Let's create new IDs or reuse?
          // To preserve relationships, we should probably reuse IDs if they are UUIDs, 
          // but old IDs might be random strings. Let's use name as key if possible or just insert.
          // Wait, Trip -> Project relationship is by NAME in the old app ("project" string field).
          // In the new app, it's by ID.
          // OLD: trip.project = "Project Name"
          // NEW: trip.projectId = UUID
          
          // Strategy: Insert Project -> Get ID -> Store in Map -> Use for Trips.
          
          // Check if project exists by name
          const { data: existing, error: existingError } = await supabase
            .from("projects")
            .select("id")
            .eq("user_id", userId)
            .eq("name", p.name)
            .maybeSingle();

          if (existingError) throw new Error(`Project lookup failed: ${existingError.message}`);

          let projectId = existing?.id;

          if (!projectId) {
            const { data: newProject, error } = await supabase.from("projects").insert({
               user_id: userId,
               name: p.name,
               producer: p.producer,
               description: p.description,
               rate_per_km: p.ratePerKm,
               starred: p.starred,
            }).select("id").single();
            
            if (error) throw new Error(`Project insert failed: ${error.message}`);
            if (newProject) {
              projectId = newProject.id;
              migratedProjects += 1;
            }
          }

          if (projectId) {
            projectMap.set(normalizeKey(p.name), projectId);
          }
        }
    }

    // 3. Migrate Trips
    if (rawTrips) {
      const trips = JSON.parse(rawTrips) as Trip[];
      const tripIdMap = new Map<string, string>();
      const tripsToInsert = trips.map((t) => {
        const sourceId = typeof t.id === "string" ? t.id : "";
        const nextId = isUuid(sourceId) ? sourceId : safeUuid();
        if (sourceId) tripIdMap.set(sourceId, nextId);

        const projectId = projectMap.get(normalizeKey(t.project)) || null;

        return {
        id: nextId,
        user_id: userId,
        project_id: projectId,
        // Keep both columns in sync (some schemas still have date_value required)
        date_value: t.date,
        trip_date: t.date,
        purpose: t.purpose,
        passengers: t.passengers,
        distance_km: t.distance,
        co2_kg: t.co2,
        route: t.route,
        rate_per_km_override: t.ratePerKmOverride,
        special_origin: t.specialOrigin,
        invoice_number: t.invoice,
        documents: t.documents
      };
      });

      // Batch insert (chunking might be needed if too many, but assume manageable for now)
      const { error: tripsError } = await supabase.from("trips").upsert(tripsToInsert, { onConflict: "id" });
      if (tripsError) throw new Error(`Trips migration failed: ${tripsError.message}`);
      migratedTrips = tripsToInsert.length;

      // 4. Migrate Reports (needs trip ID mapping)
      if (rawReports) {
        const reports = JSON.parse(rawReports) as SavedReport[];
        const reportsToInsert = reports.map((r) => {
          const sourceId = typeof r.id === "string" ? r.id : "";
          const nextId = isUuid(sourceId) ? sourceId : safeUuid();
          const mappedTripIds = Array.isArray(r.tripIds)
            ? r.tripIds
                .map((id) => (tripIdMap.get(id) ?? (isUuid(id) ? id : null)))
                .filter((id): id is string => Boolean(id))
            : [];

          return {
            id: nextId,
            user_id: userId,
            month: r.month,
            year: r.year,
            project_filter: r.project,
            trip_ids: mappedTripIds,
            start_date: r.startDate,
            end_date: r.endDate,
            total_km: r.totalDistanceKm,
            trips_count: r.tripsCount,
            driver: r.driver,
            address: r.address,
            license_plate: r.licensePlate,
            created_at: r.createdAt,
          };
        });

        const { error: reportsError } = await supabase.from("reports").upsert(reportsToInsert, { onConflict: "id" });
        if (reportsError) throw new Error(`Reports migration failed: ${reportsError.message}`);
        migratedReports = reportsToInsert.length;
      }
    }

    // Success
    localStorage.setItem(KEYS.MIGRATED, "true");

    return {
      ok: true,
      migrated: {
        projects: migratedProjects,
        trips: migratedTrips,
        reports: migratedReports,
        profile: migratedProfile,
      },
    };
    
    // Optional: Clear old data to avoid confusion?
    // localStorage.removeItem(KEYS.PROFILE);
    // localStorage.removeItem(KEYS.PROJECTS);
    // localStorage.removeItem(KEYS.TRIPS);
    // localStorage.removeItem(KEYS.REPORTS);
    // Let's keep them for safety for now, just marked "migrated"

  } catch (error) {
    console.error("Migration failed:", error);
    return { ok: false, reason: "failed", error: (error as any)?.message ?? String(error) };
  }
}
