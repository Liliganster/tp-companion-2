import { expect, it, vi } from "vitest";
const { rpc, download, from } = vi.hoisted(() => ({
  rpc: vi.fn(), download: vi.fn(), from: vi.fn(),
}));
vi.mock("../../src/lib/supabaseServer.js", () => ({
  supabaseAdmin: { rpc, from, storage: { from: () => ({ download }) } },
}));
vi.mock("../../src/lib/ai/geminiClient.js", () => ({ generateContentFromPDF: vi.fn() }));
import { extractCallsheet } from "./callsheetExtraction.js";

it("rejects a substituted foreign path before cache, download, or AI", async () => {
  rpc.mockResolvedValue({ data: false, error: null });
  await expect(extractCallsheet({
    userId: "user-a", jobId: "own-job", storagePath: "user-b/private.pdf",
    referenceIso: "2026-09-09", log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })).rejects.toThrow("storage_ownership_not_verified");
  expect(from).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
});

it("preserves the exact authorized legacy key for the download", async () => {
  rpc.mockResolvedValue({ data: true, error: null });
  from.mockReturnValue({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: null, error: null }),
  }) }) });
  download.mockResolvedValue({ data: null, error: { message: "test stops before AI" } });
  const outcome = await extractCallsheet({
    userId: "user-a", jobId: "own-job", storagePath: "legacy/Disposición antigua.pdf",
    referenceIso: "2026-09-09", log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  expect(download).toHaveBeenCalledWith("legacy/Disposición antigua.pdf");
  expect(outcome.ok).toBe(false);
});
