import { beforeEach, expect, it, vi } from "vitest";
const { rpc, remove, deleteUser, deleteRows, from } = vi.hoisted(() => ({
  rpc: vi.fn(), remove: vi.fn(), deleteUser: vi.fn(), deleteRows: vi.fn(), from: vi.fn(),
}));
vi.mock("../../src/lib/supabaseServer.js", () => ({
  supabaseAdmin: { rpc, from, storage: { from: () => ({ remove }) }, auth: { admin: { deleteUser } } },
}));
vi.mock("./supabase.js", () => ({
  requireSupabaseUser: async () => ({ id: "user-a" }),
  sendJson: (res: any, code: number, body: unknown) => { res.statusCode = code; res.body = body; },
}));
vi.mock("./rateLimit.js", () => ({ enforceRateLimit: async () => true }));
import handler from "../user.js";

beforeEach(() => vi.clearAllMocks());

it("verifies trip receipts in their actual bucket before deleting the account", async () => {
  from.mockImplementation((table: string) => ({
    select: () => ({ eq: async () => ({
      data: table === "trips" ? [{ documents: [
        { storagePath: "user-a/receipt.jpg", bucketId: "project_documents" },
      ] }] : [], error: null,
    }) }),
    delete: () => ({ eq: deleteRows }),
  }));
  rpc.mockImplementation((_name: string, args: { p_bucket: string; p_path: string }) =>
    Promise.resolve({ data: args.p_bucket === "project_documents" && args.p_path === "user-a/receipt.jpg", error: null }));
  remove.mockResolvedValue({ error: null });
  deleteRows.mockResolvedValue({ error: null });
  deleteUser.mockResolvedValue({ error: null });
  const res: any = {};
  await handler({ method: "POST", url: "/api/user/delete-account" }, res);
  expect(res.statusCode).toBe(200);
  expect(remove).toHaveBeenCalledWith(["user-a/receipt.jpg"]);
  expect(deleteUser).toHaveBeenCalledWith("user-a");
});

it("does not delete anything if the inventory cannot be read", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  from.mockReturnValue({
    select: () => ({ eq: async () => ({ data: null, error: new Error("inventory unavailable") }) }),
    delete: deleteRows,
  });
  const res: any = {};
  await handler({ method: "POST", url: "/api/user/delete-account" }, res);
  expect(res.statusCode).toBe(500);
  expect(remove).not.toHaveBeenCalled();
  expect(deleteRows).not.toHaveBeenCalled();
  expect(deleteUser).not.toHaveBeenCalled();
});

it("aborts account deletion before any removal if a document references another user's file", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  from.mockImplementation((table: string) => ({
    select: () => ({ eq: async () => ({
      data: table === "callsheet_jobs" ? [{ storage_path: "user-a/good.pdf" }]
        : table === "project_documents" ? [{ storage_path: "user-b/private.pdf" }] : [],
      error: null,
    }) }),
    delete: deleteRows,
  }));
  rpc.mockImplementation((_name: string, args: { p_path: string }) =>
    Promise.resolve({ data: args.p_path === "user-a/good.pdf", error: null }));
  const res: any = {};
  await handler({ method: "POST", url: "/api/user/delete-account" }, res);
  expect(res.statusCode).toBe(500);
  expect(remove).not.toHaveBeenCalled();
  expect(deleteRows).not.toHaveBeenCalled();
  expect(deleteUser).not.toHaveBeenCalled();
});
