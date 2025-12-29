import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => {
  const insert = vi.fn(() => ({ error: null }));
  const orderReports = vi.fn(() => ({ data: [], error: null }));

  const makeSelectBuilder = () => {
    const b: any = {
      order: orderReports,
    };
    return b;
  };

  const from = vi.fn((_table: string) => ({
    select: vi.fn(() => makeSelectBuilder()),
    insert,
    delete: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
  }));

  return { insert, orderReports, from };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: mocks.from,
  },
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

import { ReportsProvider, useReports } from "./ReportsContext";

function CaptureReports({ out }: { out: { current: ReturnType<typeof useReports> | null } }) {
  out.current = useReports();
  return null;
}

describe("ReportsContext", () => {
  it("addReport persists and updates context list", async () => {
    const out: { current: ReturnType<typeof useReports> | null } = { current: null };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ReportsProvider>
          <CaptureReports out={out} />
        </ReportsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(out.current).not.toBeNull());

    const saved = await out.current!.addReport({
      month: "01",
      year: "2025",
      project: "all",
      tripIds: ["t1"],
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      totalDistanceKm: 10,
      tripsCount: 1,
      driver: "Driver",
      address: "Address",
      licensePlate: "AAA",
    });

    await waitFor(() => expect(out.current!.reports.length).toBe(1));
    expect(saved.id).toBeTruthy();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});
