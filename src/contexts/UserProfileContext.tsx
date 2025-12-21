import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
};

const STORAGE_KEY = "user_profile";

const DEFAULT_PROFILE: UserProfile = {
  fullName: "lilianmartinez357",
  vatId: "ATU12345678",
  licensePlate: "W-123AB",
  language: "es",
  ratePerKm: "0,5",
  passengerSurcharge: "0,15",
  baseAddress: "Laurenzgasse, 6/31",
  city: "Wien",
  country: "Austria",
};

function readStoredProfile(): UserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;

    const parsed = JSON.parse(raw) as Partial<UserProfile> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_PROFILE;

    return {
      ...DEFAULT_PROFILE,
      ...parsed,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function writeStoredProfile(profile: UserProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

type UserProfileContextValue = {
  profile: UserProfile;
  saveProfile: (profile: UserProfile) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(() => readStoredProfile());

  const saveProfile = useCallback((nextProfile: UserProfile) => {
    setProfile(nextProfile);
    writeStoredProfile(nextProfile);
  }, []);

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      writeStoredProfile(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setProfile(readStoredProfile());
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<UserProfileContextValue>(() => ({ profile, saveProfile, updateProfile }), [profile, saveProfile, updateProfile]);

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
