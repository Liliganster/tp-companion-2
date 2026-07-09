import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cascadeDeleteTripById } from "./cascadeDelete";

/**
 * Stub de Supabase: cada from(tabla) devuelve un builder encadenable que
 * registra los métodos llamados y, al hacerse await, resuelve lo que diga
 * el responder del test. storage.from(bucket).remove queda registrado.
 */
type Op = { table: string; methods: Array<{ name: string; args: unknown[] }> };
type StubResult = { data?: unknown; error?: unknown; count?: number | null };

function createSupabaseStub(respond: (op: Op) => StubResult) {
  const ops: Op[] = [];
  const storageRemovals: Array<{ bucket: string; paths: string[] }> = [];

  const from = (table: string) => {
    const op: Op = { table, methods: [] };
    ops.push(op);
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const promise = Promise.resolve({ data: null, error: null, count: null, ...respond(op) });
            return promise.then.bind(promise);
          }
          return (...args: unknown[]) => {
            op.methods.push({ name: String(prop), args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const supabase = {
    from,
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          storageRemovals.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;

  const called = (table: string, method: string) =>
    ops.some((op) => op.table === table && op.methods.some((m) => m.name === method));

  return { supabase, ops, storageRemovals, called };
}

describe("cascadeDeleteTripById (Fase 5: flujo de borrado de datos)", () => {
  it("borra el archivo de storage, el callsheet_job y la fila del viaje", async () => {
    const { supabase, storageRemovals, called } = createSupabaseStub((op) => {
      if (op.table === "trips" && op.methods.some((m) => m.name === "maybeSingle")) {
        return { data: { documents: [{ storagePath: "user/job/callsheet.pdf" }], project_id: null } };
      }
      return {};
    });

    await cascadeDeleteTripById(supabase, "trip-1");

    expect(storageRemovals).toContainEqual({ bucket: "callsheets", paths: ["user/job/callsheet.pdf"] });
    expect(called("callsheet_jobs", "delete")).toBe(true);
    expect(called("trips", "delete")).toBe(true);
    expect(called("projects", "delete")).toBe(false);
  });

  it("NO borra el callsheet compartido si otro viaje aún lo referencia", async () => {
    const { supabase, storageRemovals, called } = createSupabaseStub((op) => {
      if (op.table === "trips" && op.methods.some((m) => m.name === "maybeSingle")) {
        return {
          data: {
            documents: [{ storagePath: "user/job9/dispo.pdf" }],
            project_id: null,
            callsheet_job_id: "job-9",
          },
        };
      }
      if (op.table === "callsheet_jobs" && op.methods.some((m) => m.name === "maybeSingle")) {
        return { data: { storage_path: "user/job9/dispo.pdf" } };
      }
      // Recuento de otros viajes que referencian el mismo job → hay 1 más.
      if (op.table === "trips" && op.methods.some((m) => m.name === "neq")) {
        return { count: 1 };
      }
      return {};
    });

    await cascadeDeleteTripById(supabase, "trip-1");

    // El archivo compartido sobrevive; el viaje sí se borra.
    expect(storageRemovals).toHaveLength(0);
    expect(called("callsheet_jobs", "delete")).toBe(false);
    expect(called("trips", "delete")).toBe(true);
  });

  it("si el proyecto queda sin viajes, se borra también el proyecto huérfano", async () => {
    const { supabase, called } = createSupabaseStub((op) => {
      if (op.table === "trips" && op.methods.some((m) => m.name === "maybeSingle")) {
        return { data: { documents: [], project_id: "proj-1" } };
      }
      // Recuento de viajes restantes del proyecto → 0.
      if (op.table === "trips" && op.methods.some((m) => m.name === "eq" && m.args[0] === "project_id")) {
        return { count: 0 };
      }
      return {};
    });

    await cascadeDeleteTripById(supabase, "trip-1");

    expect(called("trips", "delete")).toBe(true);
    expect(called("projects", "delete")).toBe(true);
  });
});
