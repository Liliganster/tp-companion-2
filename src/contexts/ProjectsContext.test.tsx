import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => {
  const insert = vi.fn<(...args: any[]) => any>(() => ({ error: null }));
  const orderProjects = vi.fn(() => ({ data: [], error: null }));
  const maybeSingle = vi.fn<(...args: any[]) => any>(() => ({ data: null, error: null }));

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
    cleanup();
    localStorage.clear();
    mocks.insert.mockReset().mockReturnValue({ error: null });
    mocks.maybeSingle.mockReset().mockReturnValue({ data: null, error: null });
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
      createdAt: "2025-01-01T00:00:00.000Z",
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

    // Los proyectos se persisten directamente en Supabase (no hay capa local-first aquí).
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(out.current!.projects[0]?.name).toBe("My Project");
  });
});

const candidate: Project = { id: 'unsaved-id', name: 'Fundbox', createdAt: '2026-10-01', ratePerKm: 0.5, starred: false, trips: 0, totalKm: 0, documents: 0, invoices: 0, estimatedCost: 0, shootingDays: 0, kmPerDay: 0, co2Emissions: 0 };
async function setupProjectContext() {
  const out: { current: ReturnType<typeof useProjects> | null } = { current: null };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProjectsProvider><CaptureProjects out={out} /></ProjectsProvider></QueryClientProvider>);
  await waitFor(() => expect(client.getQueryState(['projects', 'user-1'])?.status).toBe('success'));
  return { out, client };
}
describe('persisted project identity', () => {
  beforeEach(() => {
    cleanup(); localStorage.clear();
    mocks.insert.mockReset().mockReturnValue({ error: null });
    mocks.maybeSingle.mockReset().mockReturnValue({ data: null, error: null });
  });
  it('returns the existing server ID when the project list is stale', async () => {
    const { out, client } = await setupProjectContext();
    mocks.maybeSingle.mockReturnValue({ data: { id: 'real-fundbox-id' }, error: null });
    await act(async () => { expect(await out.current!.addProject(candidate)).toBe('real-fundbox-id'); });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(client.getQueryData<Project[]>(['projects', 'user-1'])?.some(p => p.id === candidate.id)).toBe(false);
  });
  it('resolves a concurrent same-name creation to the winning ID', async () => {
    const { out } = await setupProjectContext();
    mocks.maybeSingle.mockReturnValueOnce({ data: null, error: null }).mockReturnValueOnce({ data: { id: 'concurrent-id' }, error: null });
    mocks.insert.mockReturnValue({ error: { code: '23505', message: 'Duplicate project' } });
    await act(async () => { expect(await out.current!.addProject(candidate)).toBe('concurrent-id'); });
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
  });
  it('does not expose the candidate ID until persistence finishes', async () => {
    const { out, client } = await setupProjectContext();
    let finish!: (value: { error: null }) => void;
    mocks.insert.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = out.current!.addProject(candidate);
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledOnce());
    expect(client.getQueryData<Project[]>(['projects', 'user-1'])).toEqual([]);
    await act(async () => { finish({ error: null }); expect(await pending).toBe(candidate.id); });
    expect(client.getQueryData<Project[]>(['projects', 'user-1'])).toEqual([candidate]);
  });
  it.each(['lookup', 'insert', 'unresolved duplicate'])('rejects a failed %s without exposing a fake project', async failure => {
    const { out, client } = await setupProjectContext();
    const error = { code: failure === 'unresolved duplicate' ? '23505' : 'offline', message: 'Unavailable' };
    if (failure === 'lookup') mocks.maybeSingle.mockReturnValue({ data: null, error });
    else mocks.insert.mockReturnValue({ error });
    await expect(out.current!.addProject(candidate)).rejects.toEqual(error);
    expect(client.getQueryData<Project[]>(['projects', 'user-1'])).toEqual([]);
    if (failure === 'lookup') expect(mocks.insert).not.toHaveBeenCalled();
  });
});
