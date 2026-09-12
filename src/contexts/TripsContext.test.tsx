import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => {
  const insert = vi.fn(() => ({ error: null }));
  const orderTrips = vi.fn(() => ({ data: [], error: null }));
  const updateEq = vi.fn(() => ({ error: null, data: null }));

  const makeSelectBuilder = () => ({
    select: vi.fn(() => makeSelectBuilder()),
    order: orderTrips,
    eq: vi.fn(() => makeSelectBuilder()),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  const from = vi.fn((_table: string) => ({
    select: vi.fn(() => makeSelectBuilder()),
    insert,
    update: vi.fn(() => ({ eq: updateEq })),
  }));

  const channel = vi.fn((_name: string) => {
    const ch: any = {
      on: vi.fn(() => ch),
      subscribe: vi.fn(() => ch),
    };
    return ch;
  });

  const removeChannel = vi.fn();

  const profile = { fuelType: "unknown", fuelLPer100Km: "", evKwhPer100Km: "", gridKgCo2PerKwh: "" };
  return { insert, orderTrips, updateEq, from, channel, removeChannel, profile };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: mocks.from,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("./PlanContext", () => ({
  usePlan: () => ({ planTier: "basic" }),
}));

vi.mock("@/contexts/UserProfileContext", () => ({
  useUserProfile: () => ({
    profile: mocks.profile,
  }),
}));

import { TripsProvider, useTrips, type Trip } from "./TripsContext";

function CaptureTrips({ out }: { out: { current: ReturnType<typeof useTrips> | null } }) {
  out.current = useTrips();
  return null;
}

describe("TripsContext", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.insert.mockClear();
    mocks.from.mockClear();
    mocks.orderTrips.mockReset();
    mocks.orderTrips
      .mockImplementationOnce(() => ({ data: [], error: null })) // initial load
      .mockImplementation(() => ({
        data: [
          {
            id: "trip-1",
            trip_date: "2025-01-01",
            route: ["A", "B"],
            project_id: "11111111-1111-1111-1111-111111111111",
            purpose: "Test",
            passengers: 0,
            distance_km: 10,
            co2_kg: 1.2,
            projects: { name: "Project" },
          },
        ],
        error: null,
      })); // after invalidation/refetch
  });

  it("addTrip persists and updates context list", async () => {
    const out: { current: ReturnType<typeof useTrips> | null } = { current: null };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <TripsProvider>
          <CaptureTrips out={out} />
        </TripsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(out.current).not.toBeNull());
    const ctx = out.current!;

    const trip: Trip = {
      id: "trip-1",
      date: "2025-01-01",
      route: ["A", "B"],
      project: "Project",
      projectId: "11111111-1111-1111-1111-111111111111",
      purpose: "Test",
      passengers: 0,
      distance: 10,
      co2: 0,
      ratePerKmOverride: null,
      specialOrigin: "base",
      documents: [],
    };

    const ok = await ctx.addTrip(trip);
    expect(ok).toBe(true);

    await waitFor(() => expect(out.current!.trips.length).toBe(1));
    // Los viajes se persisten directamente en Supabase (no hay capa local-first aquí).
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(out.current!.trips[0]?.id).toBe("trip-1");
  });
});

it('persists user-edited route/date/distance and exposes the same values to table and report consumers',async()=>{
  const out: {current:ReturnType<typeof useTrips>|null}={current:null};
  const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
  mocks.orderTrips.mockImplementation(()=>({data:[{id:'trip-1',trip_date:'2025-01-01',route:['A','B'],distance_km:10,passengers:0,purpose:'Film',projects:null}],error:null}));
  mocks.updateEq.mockReturnValue({error:null,data:null});
  render(<QueryClientProvider client={queryClient}><TripsProvider><CaptureTrips out={out}/></TripsProvider></QueryClientProvider>);
  await waitFor(()=>expect(out.current?.trips.length).toBe(1));
  const patch={date:'2025-02-02',route:['User origin','User set','User return'],distance:25};
  expect(await out.current!.updateTrip('trip-1',patch)).toBe(true);
  const dbPatch=mocks.from.mock.results.flatMap(result=>result.value.update.mock.calls.map((call:any[])=>call[0])).find((value:any)=>value.trip_date===patch.date);
  expect(dbPatch).toMatchObject({trip_date:patch.date,distance_km:25,route:patch.route});

  await waitFor(()=>expect(out.current!.trips[0]).toMatchObject(patch));
});

it('uses configured consumption consistently on load, edit, storage sync and vehicle change',async()=>{
  mocks.profile.fuelType='gasoline'; mocks.profile.fuelLPer100Km='7';
  mocks.from.mockClear(); localStorage.clear();
  mocks.orderTrips.mockImplementation(()=>({data:[{id:'trip-co2',trip_date:'2025-01-01',route:['A','B'],distance_km:100,co2_kg:2,passengers:0,purpose:'Film',fuel_liters:50,ev_kwh_used:120,projects:null}],error:null}));
  const out: {current:ReturnType<typeof useTrips>|null}={current:null};
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const tree=()=> <QueryClientProvider client={client}><TripsProvider><CaptureTrips out={out}/></TripsProvider></QueryClientProvider>;
  const rendered=render(tree());
  const writes=()=>mocks.from.mock.results.flatMap(r=>r.value.update.mock.calls.map((call:any[])=>call[0]));
  await waitFor(()=>expect(out.current?.trips[0]?.co2).toBeCloseTo(16.17));
  await waitFor(()=>expect(writes().some(p=>Math.abs(p.co2_kg-16.17)<1e-9)).toBe(true));
  // Old per-trip liters cannot affect reports consuming context values.
  await act(async()=>{expect(await out.current!.updateTrip('trip-co2',{distance:200})).toBe(true)});
  await waitFor(()=>expect(out.current?.trips[0]?.co2).toBeCloseTo(32.34));
  expect(writes().find(p=>p.distance_km===200)?.co2_kg).toBeCloseTo(32.34);
  mocks.profile.fuelType='diesel'; mocks.profile.fuelLPer100Km='6';
  rendered.rerender(tree());
  await waitFor(()=>expect(out.current?.trips[0]?.co2).toBeCloseTo(32.16));
  await waitFor(()=>expect(writes().some(p=>Math.abs(p.co2_kg-32.16)<1e-9)).toBe(true));
  rendered.unmount(); client.clear();
  mocks.profile.fuelType='unknown'; mocks.profile.fuelLPer100Km='';
});
