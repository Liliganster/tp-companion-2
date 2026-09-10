import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import type { ReviewCallsheetJob } from '@/lib/callsheetReview';

export function useCallsheetReview() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['callsheet-review', user?.id],
    enabled: Boolean(user?.id),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const jobs: ReviewCallsheetJob[] = [];
      // Supabase caps a response: paginate so large batches are never omitted.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('callsheet_jobs')
          .select('id, storage_path, created_at, project_id, status, needs_review_reason')
          .eq('user_id', user!.id).in('status', ['failed', 'needs_review', 'out_of_quota'])
          .order('created_at').order('id').range(offset, offset + 499);
        if (error) throw error;
        jobs.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) return jobs;
      }
    },
  });
}
