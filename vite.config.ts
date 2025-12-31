import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { componentTagger } from "lovable-tagger";

function googleApiProxy(serverKey: string | undefined): Plugin {
  const GOOGLE_BASE = "https://maps.googleapis.com/maps/api";

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
        if (!req.url?.startsWith("/api/google/")) return next();
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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
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
      mode === "development" && componentTagger(),
      VitePWA({
        registerType: 'prompt',
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
           enabled: true
        },
        workbox: {
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
