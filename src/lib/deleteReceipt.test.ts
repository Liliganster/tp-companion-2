import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteReceipt } from "./deleteReceipt";

const receipt = { id: "receipt-1", storagePath: "user/receipt.webp", extractedAmount: 12 };
function fixture(options: { unlinkFails?: boolean; storageFails?: boolean; restoreFails?: boolean; project?: boolean; draft?: boolean } = {}) {
  const events: string[] = [];
  const patches: Record<string, unknown>[] = [];
  const row = options.project
    ? { id: "expense", receipts: [receipt], amount: 20 }
    : { id: "trip", documents: options.draft ? [] : [receipt, { id: "keep", storagePath: "other.pdf" }], toll_amount: 20 };
  let writes = 0;
  const from = vi.fn(() => {
    let writing = false;
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain),
      update: vi.fn((patch: Record<string, unknown>) => { writing = true; patches.push(patch); return chain; }),
      single: vi.fn(async () => {
        if (!writing) { events.push("read"); return { data: row, error: null }; }
        writes++;
        events.push(writes === 1 ? "unlink" : "restore");
        return (writes === 1 ? options.unlinkFails : options.restoreFails)
          ? { data: null, error: new Error("database failed") }
          : { data: { id: row.id }, error: null };
      }),
    };
    return chain;
  });
  const remove = vi.fn(async () => {
    events.push("remove");
    return options.storageFails ? { data: null, error: new Error("storage failed") } : { data: [{ name: receipt.storagePath }], error: null };
  });
  return { client: { from, storage: { from: vi.fn(() => ({ remove })) } } as unknown as SupabaseClient, events, patches, remove };
}
const args = { receipt, userId: "user", tripId: "trip", expenseType: "toll" as const };

describe("immediate receipt deletion", () => {
  it("persists only the receipt removal and its amount before deleting the file", async () => {
    const f = fixture();
    await deleteReceipt(f.client, args);
    expect(f.events).toEqual(["read", "unlink", "remove"]);
    expect(f.patches).toEqual([{ documents: [{ id: "keep", storagePath: "other.pdf" }], toll_amount: 8 }]);
  });
  it("does not delete the file when unlinking fails", async () => {
    const f = fixture({ unlinkFails: true });
    await expect(deleteReceipt(f.client, args)).rejects.toThrow("database failed");
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("restores the original link and amount when storage fails", async () => {
    const f = fixture({ storageFails: true });
    await expect(deleteReceipt(f.client, args)).rejects.toThrow("storage failed");
    expect(f.events).toEqual(["read", "unlink", "remove", "restore"]);
    expect(f.patches[1]).toEqual({ documents: [receipt, { id: "keep", storagePath: "other.pdf" }], toll_amount: 20 });
  });
  it("reports a failed compensation explicitly", async () => {
    const f = fixture({ storageFails: true, restoreFails: true });
    await expect(deleteReceipt(f.client, args)).rejects.toThrow("receipt_delete_recovery_failed");
  });
  it("persists project receipt removal too", async () => {
    const f = fixture({ project: true });
    await deleteReceipt(f.client, { ...args, tripId: undefined, projectId: "project" });
    expect(f.patches).toEqual([{ receipts: [], amount: 8 }]);
  });
  it("does not persist unrelated draft edits for a newly uploaded receipt", async () => {
    const f = fixture({ draft: true });
    await deleteReceipt(f.client, args);
    expect(f.events).toEqual(["read", "remove"]);
    expect(f.patches).toEqual([]);
  });
  it("requires a signed-in user before any operation", async () => {
    const f = fixture();
    await expect(deleteReceipt(f.client, { ...args, userId: "" })).rejects.toThrow();
    expect(f.events).toEqual([]);
  });
});
