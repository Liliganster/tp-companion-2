import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => {
  const insert = vi.fn(() => ({ error: null }));
  const orderProjects = vi.fn(() => ({ data: [], error: null }));
  const maybeSingle = vi.fn(() => ({ data: null, error: null }));

  const makeSelectBuilder = () => {
    const b: any = {
      eq: vi.fn(() => b),
      order: orderProjects,
      maybeSingle,
    };
    return b;
  };

  const from = vi.fn((_table: string) => ({
    select: vi.fn(() => makeSelectBuilder()),
    insert,
  }));

  const channel = vi.fn((_name: string) => {
    const ch: any = {
      on: vi.fn(() => ch),
      subscribe: vi.fn(() => ch),
    };
    return ch;
  });

  const removeChannel = vi.fn();

  return { insert, orderProjects, maybeSingle, from, channel, removeChannel };
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

vi.mock("@/hooks/use-emissions-input", () => ({
  useEmissionsInput: () => ({
    emissionsInput: {
      fuelType: "unknown",
      fuelLPer100Km: 0,
      fuelKgCo2ePerLiter: null,
      fuelKgCo2ePerKm: null,
      evKwhPer100Km: 0,
      gridKgCo2PerKwh: null,
    },
    isLoading: false,
    fuelFactorData: null,
    gridData: null,
  }),
}));

vi.mock("@/lib/cascadeDelete", () => ({
  cascadeDeleteProjectById: vi.fn().mockResolvedValue(undefined),
}));

import { ProjectsProvider, useProjects, type Project } from "./ProjectsContext";

function CaptureProjects({ out }: { out: { current: ReturnType<typeof useProjects> | null } }) {
  out.current = useProjects();
  return null;
}

describe("ProjectsContext", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.insert.mockClear();
    mocks.from.mockClear();
  });

  it("addProject persists and updates context list", async () => {
    const out: { current: ReturnType<typeof useProjects> | null } = { current: null };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectsProvider>
          <CaptureProjects out={out} />
        </ProjectsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(out.current).not.toBeNull());

    const p: Project = {
      id: "project-1",
      name: "My Project",
      ratePerKm: 0,
      starred: false,
      trips: 0,
      totalKm: 0,
      documents: 0,
      invoices: 0,
      estimatedCost: 0,
      shootingDays: 0,
      kmPerDay: 0,
      co2Emissions: 0,
    };

    await out.current!.addProject(p);
    await waitFor(() => expect(out.current!.projects.length).toBe(1));

    expect(mocks.insert).toHaveBeenCalledTimes(0);
    const raw = localStorage.getItem("fbp.localfirst:v1:projects:user-1");
    expect(raw).toBeTruthy();
  });
});
