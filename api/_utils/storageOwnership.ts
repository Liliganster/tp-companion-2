import { supabaseAdmin } from "../../src/lib/supabaseServer.js";

export class StorageOwnershipError extends Error {
  constructor() { super("storage_ownership_not_verified"); }
}

// Never normalize a path: authorization and Storage must receive identical keys.
export function isSafeStoragePath(path: string): boolean {
  return Boolean(path) && path !== "pending" && path === path.trim() &&
    !/[\\%?#]/.test(path) &&
    !Array.from(path).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

export async function assertStorageOwnership(userId: string, bucket: string, path: string): Promise<void> {
  if (!userId || !["callsheets", "project_documents"].includes(bucket) || !isSafeStoragePath(path)) {
    throw new StorageOwnershipError();
  }
  // Read trusted Storage metadata, never a user-editable job/document reference.
  // The RPC also supports legacy objects whose owner is set but path has no user prefix.
  const { data, error } = await supabaseAdmin.rpc("server_owns_storage_object", {
    p_user_id: userId, p_bucket: bucket, p_path: path,
  });
  if (error || data !== true) throw new StorageOwnershipError();
}
