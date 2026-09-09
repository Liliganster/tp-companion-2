import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../src/lib/supabaseServer.js", () => ({ supabaseAdmin: { rpc } }));
import { assertStorageOwnership, isSafeStoragePath } from "./storageOwnership.js";

describe("server storage ownership", () => {
  beforeEach(() => rpc.mockReset());
  it.each(["", "pending", "../other/file", "user/../other/file", "/user/file", "user//file",
    "user/%2e%2e/file", "user/file?x", "user/file#x", " user/file", "user/file "])(
    "rejects ambiguous key %j before querying Storage", async path => {
      await expect(assertStorageOwnership("user", "callsheets", path)).rejects.toThrow();
      expect(rpc).not.toHaveBeenCalled();
    });
  it("rejects backslashes and control characters", () => {
    expect(isSafeStoragePath("user" + String.fromCharCode(92) + "file")).toBe(false);
    expect(isSafeStoragePath("user/file" + String.fromCharCode(0))).toBe(false);
  });
  it("does not trust an apparent user prefix", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(assertStorageOwnership("user", "callsheets", "user/file.pdf")).rejects.toThrow();
  });
  it.each(["user/job/file.pdf", "legacy/Disposición antigua.pdf"])(
    "allows a key only when trusted metadata confirms ownership: %s", async path => {
      rpc.mockResolvedValue({ data: true, error: null });
      await expect(assertStorageOwnership("user", "callsheets", path)).resolves.toBeUndefined();
      expect(rpc).toHaveBeenCalledWith("server_owns_storage_object",
        { p_user_id: "user", p_bucket: "callsheets", p_path: path });
    });
  it.each([{ data: null, error: { message: "unavailable" } }, { data: null, error: null },
    { data: "true", error: null }, { data: true, error: { message: "failure" } }])(
    "fails closed on missing or failed verification", async result => {
      rpc.mockResolvedValue(result);
      await expect(assertStorageOwnership("user", "project_documents", "legacy/file.pdf")).rejects.toThrow();
    });
  it("rejects unsupported buckets", async () => {
    await expect(assertStorageOwnership("user", "other", "user/file")).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
