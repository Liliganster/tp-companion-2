import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import type { ReviewCallsheetJob } from '@/lib/callsheetReview';

export function useAttentionJobs() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ['callsheet-attention', userId],
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Lightweight database read, only while the dashboard is visible. No AI.
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: 1,
    queryFn: async ({ signal }): Promise<ReviewCallsheetJob[]> => {
      if (!userId) return [];
      const jobs: ReviewCallsheetJob[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('callsheet_jobs')
          .select('id, status, needs_review_reason, storage_path, created_at')
          .eq('user_id', userId).in('status', ['failed', 'needs_review'])
          .order('created_at', { ascending: false }).order('id')
          .range(offset, offset + 499).abortSignal(signal);
        if (error) throw error;
        jobs.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) return jobs;
      }
    },
  });
}
