import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";
import { isOffline, readOfflineCache, writeOfflineCache } from "@/lib/offlineCache";

export type UserProfile = {
  fullName: string;
  vatId: string;
  licensePlate: string;
  language: "es" | "en" | "de";
  ratePerKm: string;
  passengerSurcharge: string;
  baseAddress: string;
  city: string;
  country: string;

  fuelType: "gasoline" | "diesel" | "ev" | "unknown";
  fuelLPer100Km: string; // gasoline/diesel
  evKwhPer100Km: string; // electric
  gridKgCo2PerKwh: string; // electric
  fuelPricePerLiter: string; // gasoline/diesel
  electricityPricePerKwh: string; // electric
  maintenanceEurPerKm: string;
  otherEurPerKm: string;
};

// Default profile for new users or offline fallback
const DEFAULT_PROFILE: UserProfile = {
  fullName: "",
  vatId: "",
  licensePlate: "",
  language: "es",
  ratePerKm: "",
  passengerSurcharge: "",
  baseAddress: "",
  city: "",
  country: "",

  fuelType: "unknown",
  fuelLPer100Km: "",
  evKwhPer100Km: "",
  gridKgCo2PerKwh: "",
  fuelPricePerLiter: "",
  electricityPricePerKwh: "",
  maintenanceEurPerKm: "",
  otherEurPerKm: "",
};

type UserProfileContextValue = {
  profile: UserProfile;
  loading: boolean;
  saveProfile: (profile: UserProfile, options?: { toastId?: string; loadingText?: string; successText?: string }) => Promise<boolean>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

function detectBrowserLanguage(): UserProfile["language"] {
  if (typeof navigator === "undefined") return "es";
  const lang = (navigator.language ?? "").toLowerCase();
  if (lang.startsWith("de")) return "de";
  if (lang.startsWith("en")) return "en";
  return "es";
}

function parseProfileNumber(value: string): number | null {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const offlineCacheKey = useMemo(() => (user?.id ? `cache:profile:v1:${user.id}` : null), [user?.id]);

  // Fetch profile when user changes
  useEffect(() => {
    if (!user) {
      setProfile({ ...DEFAULT_PROFILE, language: detectBrowserLanguage() });
      setLoading(false);
      return;
    }

    let mounted = true;
    
    async function fetchProfile() {
      if (!supabase) return;

      let cachedProfile: UserProfile | null = null;
      if (offlineCacheKey) {
        cachedProfile = readOfflineCache<UserProfile>(offlineCacheKey, 90 * 24 * 60 * 60 * 1000);
        if (cachedProfile && mounted) setProfile(cachedProfile);
      }

      if (isOffline()) {
        if (mounted) setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", user!.id)
          .maybeSingle();

        if (error) {
          console.error("Error fetching profile:", error);
          if (!isOffline()) toast.error("Error loading profile: " + error.message);
          // Keep the current (possibly cached) profile instead of resetting to defaults.
          return;
        }

        if (mounted) {
          if (data) {
            const rawFuelType = String((data as any).fuel_type ?? "unknown").toLowerCase();
            const fuelType =
              rawFuelType === "gasoline" || rawFuelType === "diesel" || rawFuelType === "ev" ? rawFuelType : "unknown";
            setProfile({
              fullName: data.full_name || "",
              vatId: data.vat_id || "",
              licensePlate: data.license_plate || "",
              language: (data.language as any) || "es",
              ratePerKm: data.rate_per_km == null ? "" : String(data.rate_per_km).replace(".", ","),
              passengerSurcharge: data.passenger_surcharge == null ? "" : String(data.passenger_surcharge).replace(".", ","),
              baseAddress: data.base_address || "",
              city: data.city || "",
              country: data.country || "",

              fuelType,
              fuelLPer100Km: (data as any).fuel_l_per_100km == null ? "" : String((data as any).fuel_l_per_100km).replace(".", ","),
              evKwhPer100Km: (data as any).ev_kwh_per_100km == null ? "" : String((data as any).ev_kwh_per_100km).replace(".", ","),
              gridKgCo2PerKwh: (data as any).grid_kgco2_per_kwh == null ? "" : String((data as any).grid_kgco2_per_kwh).replace(".", ","),
              fuelPricePerLiter: (data as any).fuel_price_per_liter == null ? "" : String((data as any).fuel_price_per_liter).replace(".", ","),
              electricityPricePerKwh: (data as any).electricity_price_per_kwh == null ? "" : String((data as any).electricity_price_per_kwh).replace(".", ","),
              maintenanceEurPerKm: (data as any).maintenance_eur_per_km == null ? "" : String((data as any).maintenance_eur_per_km).replace(".", ","),
              otherEurPerKm: (data as any).other_eur_per_km == null ? "" : String((data as any).other_eur_per_km).replace(".", ","),
            });
            if (offlineCacheKey) {
              writeOfflineCache(offlineCacheKey, {
                fullName: data.full_name || "",
                vatId: data.vat_id || "",
                licensePlate: data.license_plate || "",
                language: (data.language as any) || "es",
                ratePerKm: data.rate_per_km == null ? "" : String(data.rate_per_km).replace(".", ","),
                passengerSurcharge: data.passenger_surcharge == null ? "" : String(data.passenger_surcharge).replace(".", ","),
                baseAddress: data.base_address || "",
                city: data.city || "",
                country: data.country || "",

                fuelType,
                fuelLPer100Km: (data as any).fuel_l_per_100km == null ? "" : String((data as any).fuel_l_per_100km).replace(".", ","),
                evKwhPer100Km: (data as any).ev_kwh_per_100km == null ? "" : String((data as any).ev_kwh_per_100km).replace(".", ","),
                gridKgCo2PerKwh: (data as any).grid_kgco2_per_kwh == null ? "" : String((data as any).grid_kgco2_per_kwh).replace(".", ","),
                fuelPricePerLiter: (data as any).fuel_price_per_liter == null ? "" : String((data as any).fuel_price_per_liter).replace(".", ","),
                electricityPricePerKwh: (data as any).electricity_price_per_kwh == null ? "" : String((data as any).electricity_price_per_kwh).replace(".", ","),
                maintenanceEurPerKm: (data as any).maintenance_eur_per_km == null ? "" : String((data as any).maintenance_eur_per_km).replace(".", ","),
                otherEurPerKm: (data as any).other_eur_per_km == null ? "" : String((data as any).other_eur_per_km).replace(".", ","),
              });
            }
          } else if (!cachedProfile) {
             // New user? We could auto-create a profile here or wait for them to save.
             // For now, keep defaults but respect browser language.
             setProfile({ ...DEFAULT_PROFILE, language: detectBrowserLanguage() });
          }
        }
      } catch (err) {
        console.error("Profile fetch failed:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchProfile();

    return () => { mounted = false; };
  }, [offlineCacheKey, user]);

  const saveProfile = useCallback(async (
    nextProfile: UserProfile,
    options?: { toastId?: string; loadingText?: string; successText?: string },
  ): Promise<boolean> => {
    if (offlineCacheKey) writeOfflineCache(offlineCacheKey, nextProfile);
    if (!supabase || !user) {
      setProfile(nextProfile);
      return true;
    }

    // transform to snake_case for DB
    const dbPayload = {
      id: user.id,
      full_name: nextProfile.fullName,
      vat_id: nextProfile.vatId,
      license_plate: nextProfile.licensePlate,
      language: nextProfile.language,
      rate_per_km: parseProfileNumber(nextProfile.ratePerKm),
      passenger_surcharge: parseProfileNumber(nextProfile.passengerSurcharge),
      base_address: nextProfile.baseAddress,
      city: nextProfile.city,
      country: nextProfile.country,

      fuel_type: nextProfile.fuelType,
      fuel_l_per_100km: parseProfileNumber(nextProfile.fuelLPer100Km),
      ev_kwh_per_100km: parseProfileNumber(nextProfile.evKwhPer100Km),
      grid_kgco2_per_kwh: parseProfileNumber(nextProfile.gridKgCo2PerKwh),
      fuel_price_per_liter: parseProfileNumber(nextProfile.fuelPricePerLiter),
      electricity_price_per_kwh: parseProfileNumber(nextProfile.electricityPricePerKwh),
      maintenance_eur_per_km: parseProfileNumber(nextProfile.maintenanceEurPerKm),
      other_eur_per_km: parseProfileNumber(nextProfile.otherEurPerKm),
      updated_at: new Date().toISOString()
    };

    setProfile(nextProfile); // Optimistic update

    const toastId = options?.toastId ?? "profile-save";
    const saveViaApi = async (): Promise<boolean> => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("Error getting session for profile save:", sessionError);
          return false;
        }

        const token = sessionData.session?.access_token;
        if (!token) return false;

        const response = await fetch("/api/user/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(dbPayload),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          console.error("Profile save API failed:", response.status, text);
          return false;
        }

        return true;
      } catch (err) {
        console.error("Profile save API failed:", err);
        return false;
      }
    };
    toast.loading(options?.loadingText ?? "Guardando...", { id: toastId });

    // Avoid UPSERT here: in Supabase/Postgres, INSERT ... ON CONFLICT DO UPDATE still evaluates INSERT RLS.
    // If INSERT policies were tightened/removed, updates would incorrectly fail. We update first and only insert if needed.
    const { id: _id, ...updatePayload } = dbPayload;
    const { data: updated, error: updateError } = await supabase
      .from("user_profiles")
      .update(updatePayload)
      .eq("id", user.id)
      .select("id");

    if (updateError) {
      console.error("Error saving profile (update):", updateError);
      const ok = await saveViaApi();
      if (ok) {
        toast.success(options?.successText ?? "Perfil guardado", { id: toastId });
        return true;
      }

      toast.error("No se pudo guardar: " + updateError.message, { id: toastId });
      return false;
    }

    if (!updated || updated.length === 0) {
      const ok = await saveViaApi();
      if (ok) {
        toast.success(options?.successText ?? "Perfil guardado", { id: toastId });
        return true;
      }

      const { error: insertError } = await supabase
        .from("user_profiles")
        .insert(dbPayload)
        .select("id");

      if (insertError) {
        console.error("Error saving profile (insert):", insertError);
        const ok2 = await saveViaApi();
        if (ok2) {
          toast.success(options?.successText ?? "Perfil guardado", { id: toastId });
          return true;
        }

        toast.error("No se pudo guardar: " + insertError.message, { id: toastId });
        return false;
      }
    }

    toast.success(options?.successText ?? "Perfil guardado", { id: toastId });
    return true;
  }, [offlineCacheKey, user]);

  const updateProfile = useCallback(async (patch: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...patch };
      void saveProfile(next); // Fire-and-forget; errors are handled inside saveProfile
      return next;
    });
  }, [saveProfile]);

  const value = useMemo<UserProfileContextValue>(() => ({ 
    profile, 
    loading, 
    saveProfile, 
    updateProfile 
  }), [profile, loading, saveProfile, updateProfile]);

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext);
  if (!ctx) throw new Error("useUserProfile must be used within a UserProfileProvider");
  return ctx;
}



export function getProfileInitial(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return "?";
  return trimmed[0].toUpperCase();
}
