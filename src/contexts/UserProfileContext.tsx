import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./AuthContext";

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
  planTier: "free" | "pro"; // Added planTier
};

// Default profile for new users or offline fallback
const DEFAULT_PROFILE: UserProfile = {
  fullName: "",
  vatId: "",
  licensePlate: "",
  language: "es",
  ratePerKm: "0,42",
  passengerSurcharge: "0,05",
  baseAddress: "",
  city: "",
  country: "",
  planTier: "free"
};

type UserProfileContextValue = {
  profile: UserProfile;
  loading: boolean;
  saveProfile: (profile: UserProfile) => Promise<void>;
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

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);

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
      
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", user!.id)
          .single();

        if (error && error.code !== "PGRST116") { // PGRST116 = 0 rows
          console.error("Error fetching profile:", error);
        }

        if (mounted) {
          if (data) {
            setProfile({
              fullName: data.full_name || "",
              vatId: data.vat_id || "",
              licensePlate: data.license_plate || "",
              language: (data.language as any) || "es",
              ratePerKm: data.rate_per_km?.toString().replace(".", ",") || "0,42",
              passengerSurcharge: data.passenger_surcharge?.toString().replace(".", ",") || "0,05",
              baseAddress: data.base_address || "",
              city: data.city || "",
              country: data.country || "",
              planTier: data.plan_tier || "free"
            });
          } else {
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
  }, [user]);

  const saveProfile = useCallback(async (nextProfile: UserProfile) => {
    if (!supabase || !user) {
      setProfile(nextProfile);
      return; 
    }

    // transform to snake_case for DB
    const dbPayload = {
      id: user.id,
      full_name: nextProfile.fullName,
      vat_id: nextProfile.vatId,
      license_plate: nextProfile.licensePlate,
      language: nextProfile.language,
      rate_per_km: parseFloat(nextProfile.ratePerKm.replace(",", ".")),
      passenger_surcharge: parseFloat(nextProfile.passengerSurcharge.replace(",", ".")),
      base_address: nextProfile.baseAddress,
      city: nextProfile.city,
      country: nextProfile.country,
      plan_tier: nextProfile.planTier,
      updated_at: new Date().toISOString()
    };

    setProfile(nextProfile); // Optimistic update

    const { error } = await supabase.from("user_profiles").upsert(dbPayload);
    if (error) {
      console.error("Error saving profile:", error);
      // Ideally revert state or show toast, but keeping it simple
    }
  }, [user]);

  const updateProfile = useCallback(async (patch: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...patch };
      saveProfile(next); // This triggers the DB call
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
