import { resolveCallsheetProcessingState } from '@/lib/callsheetProcessingState';
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
          .select('id, storage_path, created_at, project_id, status, processing_started_at, processed_at, needs_review_reason, callsheet_results(date_value, date_evidence, project_value), callsheet_locations(formatted_address, address_raw, name_raw, page, position, label_source, selection_state, review_reason)')
          .eq('user_id', user!.id).in('status', ['created', 'queued', 'processing', 'done', 'failed', 'needs_review', 'out_of_quota', 'cancelled'])
          .order('created_at').order('id').range(offset, offset + 499);
        if (error) throw error;
        jobs.push(...(data ?? []).map(job => ({ ...resolveCallsheetProcessingState(job, false), callsheet_results: Array.isArray(job.callsheet_results) ? job.callsheet_results[0] ?? null : job.callsheet_results })));
        if ((data?.length ?? 0) < 500) return jobs;
      }
    },
  });
}
