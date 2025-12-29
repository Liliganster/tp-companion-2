import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
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

  return { insert, orderTrips, updateEq, from, channel, removeChannel };
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

vi.mock("@/contexts/UserProfileContext", () => ({
  useUserProfile: () => ({
    profile: {
      fuelType: "unknown",
      fuelLPer100Km: "",
      evKwhPer100Km: "",
      gridKgCo2PerKwh: "",
    },
  }),
}));

import { TripsProvider, useTrips, type Trip } from "./TripsContext";

function CaptureTrips({ out }: { out: { current: ReturnType<typeof useTrips> | null } }) {
  out.current = useTrips();
  return null;
}

describe("TripsContext", () => {
  beforeEach(() => {
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
            project_id: "project-1",
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
      projectId: "project-1",
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
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0]?.[0]).toMatchObject({
      id: "trip-1",
      user_id: "user-1",
      project_id: "project-1",
      distance_km: 10,
    });
  });
});
