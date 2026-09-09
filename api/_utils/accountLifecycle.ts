import { supabaseAdmin } from '../../src/lib/supabaseServer.js';

export async function isAccountDeleting(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('account_deletion_requests').select('user_id').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
