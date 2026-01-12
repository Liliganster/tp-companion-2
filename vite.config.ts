import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { componentTagger } from "lovable-tagger";


function googleApiProxy(serverKey: string | undefined): Plugin {
  const GOOGLE_BASE = "https://maps.googleapis.com/maps/api";
  const HANDLED_PREFIXES = ["/api/google/directions", "/api/google/geocode", "/api/google/places-autocomplete"];

  const readBody = async (req: any) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const send = (res: any, statusCode: number, payload: unknown) => {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  };

  const withKey = (params: URLSearchParams) => {
    if (!serverKey) return false;
    params.set("key", serverKey);
    return true;
  };

  return {
    name: "google-api-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/google/")) return next();
        // Only handle the endpoints implemented in this dev middleware.
        // Everything else (OAuth, Calendar, Drive, etc.) should be handled by Vercel functions.
        if (!HANDLED_PREFIXES.some((prefix) => url.startsWith(prefix))) return next();
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.end();
          return;
        }
        if (!serverKey) return send(res, 500, { error: "Missing GOOGLE_MAPS_SERVER_KEY" });

        const body = await readBody(req);
        const language = typeof body?.language === "string" ? body.language : undefined;

        if (req.url.startsWith("/api/google/directions")) {
          const origin = body?.origin;
          const destination = body?.destination;
          const waypoints = Array.isArray(body?.waypoints) ? body.waypoints : [];
          if (typeof origin !== "string" || !origin.trim()) return send(res, 400, { error: "origin is required" });
          if (typeof destination !== "string" || !destination.trim()) return send(res, 400, { error: "destination is required" });
          if (waypoints.some((w: any) => typeof w !== "string")) return send(res, 400, { error: "waypoints must be string[]" });

          const params = new URLSearchParams({ origin, destination, mode: "driving" });
          if (language) params.set("language", language);
          if (waypoints.length) params.set("waypoints", waypoints.join("|"));
          if (!withKey(params)) return send(res, 500, { error: "Missing GOOGLE_MAPS_SERVER_KEY" });

          const response = await fetch(`${GOOGLE_BASE}/directions/json?${params.toString()}`);
          const data: any = await response.json().catch(() => null);
          if (!response.ok || !data) return send(res, 502, { error: "Failed to contact Google Directions API" });
          if (data.status !== "OK" || !data.routes?.[0]) return send(res, 400, { error: data.status ?? "UNKNOWN", message: data.error_message });

	          const route = data.routes[0];
	          const legs = Array.isArray(route.legs)
	            ? route.legs.map((leg: any) => ({
	                startLocation: leg?.start_location,
	                endLocation: leg?.end_location,
	                distanceMeters: typeof leg?.distance?.value === "number" ? leg.distance.value : null,
	                durationSeconds: typeof leg?.duration?.value === "number" ? leg.duration.value : null,
	              }))
	            : [];
	          const totalDistanceMeters = legs.reduce((acc: number, leg: any) => acc + (typeof leg?.distanceMeters === "number" ? leg.distanceMeters : 0), 0);
	          return send(res, 200, { overviewPolyline: route?.overview_polyline?.points ?? "", bounds: route?.bounds ?? null, legs, totalDistanceMeters });
	        }

        if (req.url.startsWith("/api/google/geocode")) {
          const address = body?.address;
          if (typeof address !== "string" || !address.trim()) return send(res, 400, { error: "address is required" });

          const params = new URLSearchParams({ address });
          if (language) params.set("language", language);
          if (!withKey(params)) return send(res, 500, { error: "Missing GOOGLE_MAPS_SERVER_KEY" });

          const response = await fetch(`${GOOGLE_BASE}/geocode/json?${params.toString()}`);
          const data: any = await response.json().catch(() => null);
          if (!response.ok || !data) return send(res, 502, { error: "Failed to contact Google Geocoding API" });
          if (data.status !== "OK" || !data.results?.[0]) return send(res, 400, { error: data.status ?? "UNKNOWN", message: data.error_message });

          const result = data.results[0];
          return send(res, 200, {
            location: result?.geometry?.location ?? null,
            formattedAddress: result?.formatted_address ?? "",
            placeId: result?.place_id ?? "",
          });
        }

        if (req.url.startsWith("/api/google/places-autocomplete")) {
          const input = body?.input;
          if (typeof input !== "string" || !input.trim()) return send(res, 400, { error: "input is required" });

          const params = new URLSearchParams({ input, types: "address" });
          if (language) params.set("language", language);
          if (!withKey(params)) return send(res, 500, { error: "Missing GOOGLE_MAPS_SERVER_KEY" });

          const response = await fetch(`${GOOGLE_BASE}/place/autocomplete/json?${params.toString()}`);
          const data: any = await response.json().catch(() => null);
          if (!response.ok || !data) return send(res, 502, { error: "Failed to contact Google Places API" });
          if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return send(res, 400, { error: data.status ?? "UNKNOWN", message: data.error_message });

          const predictions = Array.isArray(data.predictions)
            ? data.predictions.slice(0, 8).map((p: any) => ({ description: p?.description ?? "", placeId: p?.place_id ?? "" }))
            : [];
          return send(res, 200, { predictions });
        }

        return next();
      });
    },
  };
}

function climatiqProxy(apiKey: string | undefined): Plugin {
  const ESTIMATE_URL = "https://api.climatiq.io/data/v1/estimate";
  const DEFAULT_DATA_VERSION = "^21";
  
  // Diesel and Gasoline: use volume (liters) so the app consumes `kgCo2ePerLiter`
  // consistently with the production backend (`api/climatiq/fuel-factor.ts`).
  const FUEL_CONFIG: Record<string, {
    activityId: string;
    region: string;
    paramType: "volume" | "distance";
    fallbackValue: number;
  }> = {
    gasoline: {
      activityId: "fuel-type_motor_gasoline-fuel_use_na",
      region: "EU",
      paramType: "volume",
      fallbackValue: 2.31,
    },
    diesel: {
      activityId: "fuel-type_diesel-fuel_use_na",
      region: "EU",
      paramType: "volume",
      fallbackValue: 2.68,
    },
  };

  const send = (res: any, statusCode: number, payload: unknown) => {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  };

  // Dev-only in-memory cache to avoid calling Climatiq on every page refresh.
  // This complements React Query (which is in-memory per page load) and keeps
  // dev behavior closer to production where we persist results in Supabase.
  const devCache = new Map<string, { payload: any; expiresAt: number }>();
  const DEV_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  return {
    name: "climatiq-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/climatiq/fuel-factor")) return next();
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Allow", "GET");
          res.end();
          return;
        }

        const url = new URL(req.url, "http://localhost");
        const fuelTypeParam = url.searchParams.get("fuelType") || url.searchParams.get("fuel");
        const fuelType = fuelTypeParam?.toLowerCase() === "diesel" ? "diesel" : 
                        (fuelTypeParam?.toLowerCase() === "gasoline" || fuelTypeParam?.toLowerCase() === "petrol") ? "gasoline" : null;
        
        if (!fuelType) return send(res, 400, { error: "invalid_fuel_type" });
        
        const config = FUEL_CONFIG[fuelType];
        const cacheKey = String(fuelType);

        const cached = devCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return send(res, 200, {
            ...cached.payload,
            method: "cache",
          });
        }

        // If no API key, return fallback data
        if (!apiKey) {
          const payload = {
            fuelType,
            ...(config.paramType === "volume" 
              ? { kgCo2ePerLiter: config.fallbackValue }
              : { kgCo2ePerKm: config.fallbackValue }
            ),
            activityId: config.activityId,
            dataVersion: DEFAULT_DATA_VERSION,
            source: "fallback",
            year: null,
            region: config.region,
            cachedTtlSeconds: 2592000,
            method: "fallback",
            fallback: true,
          };
          devCache.set(cacheKey, { payload, expiresAt: Date.now() + DEV_CACHE_TTL_MS });
          return send(res, 200, payload);
        }

        // Call Climatiq API with fuel-type specific parameters
        const parameters = config.paramType === "volume"
          ? { volume: 1, volume_unit: "l" }
          : { distance: 1, distance_unit: "km" };
        
        const requestBody = {
          emission_factor: {
            activity_id: config.activityId,
            region: config.region,
            data_version: DEFAULT_DATA_VERSION,
          },
          parameters,
        };

        try {
          const upstream = await fetch(ESTIMATE_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(requestBody),
          });

          const data = await upstream.json().catch(() => null);
          
          if (!upstream.ok || !data) {
            return send(res, 502, {
              error: "climatiq_error",
              message: data?.message || data?.error || "Failed to contact Climatiq",
              upstreamStatus: upstream.status,
            });
          }

          const co2e = Number(data?.co2e);
          if (!Number.isFinite(co2e) || co2e <= 0) {
            return send(res, 502, { error: "climatiq_error", message: "Invalid co2e payload" });
          }

          const payload = {
            fuelType,
            ...(config.paramType === "volume" 
              ? { kgCo2ePerLiter: co2e }
              : { kgCo2ePerKm: co2e }
            ),
            activityId: config.activityId,
            dataVersion: DEFAULT_DATA_VERSION,
            source: data?.emission_factor?.source ?? "climatiq",
            year: data?.emission_factor?.year ?? null,
            region: data?.emission_factor?.region || config.region,
            cachedTtlSeconds: 2592000,
            method: "data",
            fallback: false,
            request: requestBody,
            upstream: { ok: upstream.ok, status: upstream.status, data },
          };
          devCache.set(cacheKey, { payload, expiresAt: Date.now() + DEV_CACHE_TTL_MS });
          return send(res, 200, payload);
        } catch (err: any) {
          return send(res, 502, {
            error: "climatiq_error",
            message: err?.message || "Network error",
          });
        }
      });
    },
  };
}

function vercelDevApiProxy(targetOrigin: string | undefined): Plugin {
  const sendJson = (res: any, statusCode: number, payload: unknown) => {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  };

  const readRawBody = async (req: any): Promise<Buffer | undefined> => {
    if (req.method === "GET" || req.method === "HEAD") return undefined;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (!chunks.length) return undefined;
    return Buffer.concat(chunks);
  };

  const shouldProxy = (url: string) =>
    url.startsWith("/api/google/oauth") ||
    url.startsWith("/api/google/calendar") ||
    url.startsWith("/api/google/drive") ||
    url.startsWith("/api/google/place-details");

  return {
    name: "vercel-dev-api-proxy",
    apply: "serve",
    configureServer(server) {
      if (!targetOrigin) return;

      let baseUrl: URL;
      try {
        baseUrl = new URL(targetOrigin);
      } catch {
        throw new Error(`Invalid VERCEL_DEV_API_ORIGIN: ${targetOrigin}`);
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!shouldProxy(url)) return next();

        const upstreamUrl = new URL(url, baseUrl);
        const headers: Record<string, string> = {};

        for (const [key, value] of Object.entries(req.headers ?? {})) {
          if (value == null) continue;
          const normalized = Array.isArray(value) ? value.join(",") : String(value);
          headers[key] = normalized;
        }

        delete headers.host;
        delete headers.connection;
        delete headers["content-length"];

        try {
          const body = await readRawBody(req);
          const upstream = await fetch(upstreamUrl, {
            method: req.method,
            headers,
            body,
            redirect: "manual",
          });

          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (key.toLowerCase() === "transfer-encoding") return;
            res.setHeader(key, value);
          });

          const buf = Buffer.from(await upstream.arrayBuffer());
          res.end(buf);
        } catch (err: any) {
          return sendJson(res, 502, {
            error: "vercel_dev_unreachable",
            message: err?.message || "Failed to reach Vercel dev server",
            target: targetOrigin,
          });
        }
      });
    },
  };
}


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    build: {
      // Enable source maps in production to help debug minified code errors
      sourcemap: true,
      // This project intentionally bundles a lot of UI and reporting code; keep the build output clean.
      chunkSizeWarningLimit: 1500,
    },
    server: {
      host: "::",
      port: 8080,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      globals: true,
      css: true,
      restoreMocks: true,
      clearMocks: true,
      exclude: ["e2e/**", "node_modules/**", "dist/**"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
    plugins: [
      react(),
      mode === "development" && googleApiProxy(env.GOOGLE_MAPS_SERVER_KEY),
      mode === "development" && climatiqProxy(env.CLIMATIQ_API_KEY),
      mode === "development" && vercelDevApiProxy(env.VERCEL_DEV_API_ORIGIN),

      mode === "development" && componentTagger(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        // Keep assets list in sync with files present in /public (Vercel serves them at /).
        includeAssets: ['favicon.ico', 'logo.svg'],
        manifest: {
          name: 'Trip Companion',
          short_name: 'TripComp',
          description: 'Trip Companion App',
          theme_color: '#ffffff',
          icons: [
            {
              src: 'logo.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'favicon.ico',
              sizes: '48x48',
              type: 'image/x-icon',
              purpose: 'any'
            }
          ]
        },
        devOptions: {
           enabled: false
        },
        workbox: {
          // skipWaiting: false - We handle this manually via messageSkipWaiting() when user clicks update
          skipWaiting: false,
          // clientsClaim: true - New SW takes control of all clients immediately after activation
          clientsClaim: true,
          cleanupOutdatedCaches: true,
        }
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
