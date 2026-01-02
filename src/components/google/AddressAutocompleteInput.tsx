import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { getCountryCode } from "@/lib/country-mapping";
import { Loader2 } from "lucide-react";

const DEBUG = import.meta.env.DEV;

type PlacePrediction = { description: string; placeId: string };

export function AddressAutocompleteInput({
  value,
  onCommit,
  onDraftChange,
  placeholder,
  disabled,
  className,
  country,
  locationBias,
}: {
  value: string;
  onCommit: (value: string) => void;
  onDraftChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  country?: string;
  locationBias?: { lat: number; lng: number };
}) {
  const countryCode = useMemo(() => getCountryCode(country), [country]);
  const { getAccessToken } = useAuth();

  const [draft, setDraft] = useState(value);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetched = useRef<string>("");
  const cache = useRef<Map<string, PlacePrediction[]>>(new Map());
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    if (hasFocus) return;
    setDraft(value);
  }, [value, hasFocus]);

  useEffect(() => {
    if (disabled) return;
    if (!hasFocus) return;

    const query = draft.trim();
    if (query.length < 4) {
      setPredictions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      if (lastFetched.current === query) return;
      lastFetched.current = query;

      const cached = cache.current.get(query);
      if (cached) {
        setPredictions(cached);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const body: any = { input: query };
        if (countryCode) {
          body.components = `country:${countryCode}`;
          body.region = countryCode;
          if (DEBUG) console.log(`[Autocomplete] Country: "${country}" -> Code: "${countryCode}" -> Components: "${body.components}"`);
        } else {
          if (DEBUG) console.warn(`[Autocomplete] No country code found for: "${country}"`);
        }

        // locationBias is reserved for future improvements (kept for parity with Trip modal).
        void locationBias;

        const token = await getAccessToken();
        if (!token) {
          setPredictions([]);
          return;
        }

        const response = await fetch("/api/google/places-autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => null)) as { predictions?: PlacePrediction[] } | null;
        if (!response.ok || !data || !Array.isArray(data.predictions)) {
          setPredictions([]);
          return;
        }
        const next = data.predictions.filter((p) => p?.description);
        cache.current.set(query, next);
        setPredictions(next);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [draft, disabled, hasFocus, countryCode, country, getAccessToken, locationBias]);

  const showDropdown = hasFocus && !disabled && (loading || predictions.length > 0);

  return (
    <div className="relative">
      <Input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onDraftChange?.(e.target.value);
        }}
        onFocus={() => setHasFocus(true)}
        onBlur={() => {
          setHasFocus(false);
          setPredictions([]);
          onCommit(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setHasFocus(false);
            setPredictions([]);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />

      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        </div>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[60] rounded-md border bg-popover p-1 shadow-md">
          <div className="max-h-56 overflow-auto">
            {predictions.map((p) => (
              <button
                key={p.placeId || p.description}
                type="button"
                className="w-full text-left rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setHasFocus(false);
                  setPredictions([]);

                  // 1. Optimistic update
                  setDraft(p.description);
                  onDraftChange?.(p.description);

                  // 2. Fetch full details to get canonical formatted address
                  setLoading(true);
                  try {
                    const token = await getAccessToken();
                    if (!token) {
                      onCommit(p.description);
                      return;
                    }
                    const res = await fetch("/api/google/place-details", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ placeId: p.placeId, region: countryCode }),
                    });
                    const data = await res.json();

                    if (res.ok && data?.formattedAddress) {
                      setDraft(data.formattedAddress);
                      onDraftChange?.(data.formattedAddress);
                      onCommit(data.formattedAddress);
                    } else {
                      onCommit(p.description);
                    }
                  } catch {
                    onCommit(p.description);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {p.description}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
