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

export async function checkAndMigrateData(userId: string) {
  if (typeof window === "undefined") return;
  
  const isMigrated = localStorage.getItem(KEYS.MIGRATED);
  if (isMigrated) return;

  const rawProfile = localStorage.getItem(KEYS.PROFILE);
  const rawProjects = localStorage.getItem(KEYS.PROJECTS);
  const rawTrips = localStorage.getItem(KEYS.TRIPS);
  const rawReports = localStorage.getItem(KEYS.REPORTS);

  if (!rawProfile && !rawProjects && !rawTrips && !rawReports) {
    localStorage.setItem(KEYS.MIGRATED, "true");
    return;
  }

  try {
    // 1. Migrate Profile
    if (rawProfile) {
      const profile = JSON.parse(rawProfile) as UserProfile;
      await supabase.from("user_profiles").upsert({
        id: userId,
        full_name: profile.fullName,
        vat_id: profile.vatId,
        license_plate: profile.licensePlate,
        base_address: profile.baseAddress,
        city: profile.city,
        country: profile.country,
        // image_url: profile.imageUrl, // Not in UserProfile type
        rate_per_km: profile.ratePerKm,
        passenger_surcharge: profile.passengerSurcharge,
        currency: "EUR", // Default
        language: profile.language,
        // theme: profile.theme, // Not in UserProfile type
        // calendar_enabled: profile.calendarEnabled, // Not in UserProfile type
        // email_notifications: profile.emailNotifications, // Not in UserProfile type
        // marketing_emails: profile.marketingEmails // Not in UserProfile type
      }, { onConflict: "id" });
    }

    // 2. Migrate Projects
    const projectMap = new Map<string, string>(); // Old Name -> New UUID
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
          const { data: existing } = await supabase
            .from("projects")
            .select("id")
            .eq("user_id", userId)
            .eq("name", p.name)
            .maybeSingle();

          let projectId = existing?.id;

          if (!projectId) {
            const { data: newProject, error } = await supabase.from("projects").insert({
               user_id: userId,
               name: p.name,
               producer: p.producer,
               description: p.description,
               rate_per_km: p.ratePerKm,
               starred: p.starred,
               trips_count: p.trips,
               total_km: p.totalKm,
               documents_count: p.documents,
               invoices_count: p.invoices,
               estimated_cost: p.estimatedCost,
               co2_emissions: p.co2Emissions
            }).select("id").single();
            
            if (newProject) projectId = newProject.id;
          }

          if (projectId) {
            projectMap.set(p.name, projectId);
          }
        }
    }

    // 3. Migrate Trips
    if (rawTrips) {
      const trips = JSON.parse(rawTrips) as Trip[];
      const tripsToInsert = trips.map(t => ({
        id: t.id, // Try to keep ID
        user_id: userId,
        project_id: projectMap.get(t.project) || null, // Map name to ID
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
      }));

      // Batch insert (chunking might be needed if too many, but assume manageable for now)
      const { error } = await supabase.from("trips").upsert(tripsToInsert, { onConflict: "id" });
      if (error) console.error("Error migrating trips:", error);
    }

    // 4. Migrate Reports
    if (rawReports) {
      const reports = JSON.parse(rawReports) as SavedReport[];
      const reportsToInsert = reports.map(r => ({
        id: r.id,
        user_id: userId,
        month: r.month,
        year: r.year,
        project_filter: r.project,
        trip_ids: r.tripIds, // JSONB
        start_date: r.startDate,
        end_date: r.endDate,
        total_km: r.totalDistanceKm,
        trips_count: r.tripsCount,
        driver: r.driver,
        address: r.address,
        license_plate: r.licensePlate,
        created_at: r.createdAt
      }));
      
      const { error } = await supabase.from("reports").upsert(reportsToInsert, { onConflict: "id" });
      if (error) console.error("Error migrating reports:", error);
    }

    // Success
    localStorage.setItem(KEYS.MIGRATED, "true");
    
    // Optional: Clear old data to avoid confusion?
    // localStorage.removeItem(KEYS.PROFILE);
    // localStorage.removeItem(KEYS.PROJECTS);
    // localStorage.removeItem(KEYS.TRIPS);
    // localStorage.removeItem(KEYS.REPORTS);
    // Let's keep them for safety for now, just marked "migrated"

  } catch (error) {
    console.error("Migration failed:", error);
  }
}
