import type { SupabaseClient } from "@supabase/supabase-js";

type Receipt = { id: string; storagePath: string };
type Document = Receipt & { amount?: number | null; extractedAmount?: number | null };

// Database and Storage cannot share a transaction. Unlink first, then remove the
// object; restore the link on a Storage failure. Compare the original values so
// a concurrent edit is never overwritten (including during compensation).
export async function deleteReceipt(client: SupabaseClient, args: {
  receipt: Receipt;
  userId: string;
  tripId?: string;
  projectId?: string;
  expenseType: "toll" | "parking" | "fuel" | "other";
}) {
  const { receipt, userId, tripId, projectId, expenseType } = args;
  if (!userId || !receipt.storagePath) throw new Error("receipt_delete_failed");
  let restore: (() => Promise<void>) | undefined;
  if (tripId || projectId) {
    const table = tripId ? "trips" : "project_expenses";
    const listKey = tripId ? "documents" : "receipts";
    const amountKey = tripId
      ? ({ toll: "toll_amount", parking: "parking_amount", fuel: "fuel_amount", other: "other_expenses" } as const)[expenseType]
      : "amount";
    let query = client.from(table).select(`id,${listKey},${amountKey}`).eq("user_id", userId);
    query = tripId ? query.eq("id", tripId) : query.eq("project_id", projectId!).eq("expense_type", expenseType);
    const { data: row, error } = await query.single();
    if (error || !row) throw error ?? new Error("receipt_delete_failed");
    const record = row as unknown as Record<string, unknown>;
    const before = (record[listKey] ?? []) as Document[];
    const removed = before.find(d => d.id === receipt.id && d.storagePath === receipt.storagePath);
    // A newly uploaded receipt in a trip draft may not be persisted yet.
    if (!removed && !tripId) throw new Error("receipt_delete_failed");
    if (removed) {
      const after = before.filter(d => d !== removed);
      const oldAmount = record[amountKey];
      const newAmount = Math.max(0, Number(oldAmount ?? 0) - Number(removed.extractedAmount ?? removed.amount ?? 0));
      const write = async (expected: Document[], expectedAmount: unknown, next: Document[], amount: unknown) => {
        let update = client.from(table).update({ [listKey]: next, [amountKey]: amount })
          .eq("id", record.id).eq("user_id", userId).eq(listKey, JSON.stringify(expected));
        update = expectedAmount == null ? update.is(amountKey, null) : update.eq(amountKey, expectedAmount);
        const result = await update.select("id").single();
        if (result.error || !result.data) throw result.error ?? new Error("receipt_delete_conflict");
      };
      await write(before, oldAmount, after, newAmount);
      restore = () => write(after, newAmount, before, oldAmount);
    }
  }
  try {
    const { data, error } = await client.storage.from("project_documents").remove([receipt.storagePath]);
    if (error || !data?.length) throw error ?? new Error("receipt_delete_failed");
  } catch (error) {
    if (restore) {
      try { await restore(); }
      catch { throw new Error("receipt_delete_recovery_failed"); }
    }
    throw error;
  }
}
