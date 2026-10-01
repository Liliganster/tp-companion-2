import type { SupabaseClient } from '@supabase/supabase-js';
export type ProjectTripDrag = { tripId: string; sourceProjectId: string };
export type ProjectTripMoveResult = { source_deleted: boolean; source_retained: boolean; project_name: string };
export async function moveProjectTrip(client: SupabaseClient, trip: ProjectTripDrag, targetProjectId: string): Promise<ProjectTripMoveResult> {
  const { data, error } = await client.rpc('move_trip_to_project', {
    p_trip_id: trip.tripId, p_source_project_id: trip.sourceProjectId, p_target_project_id: targetProjectId,
  });
  if (error) throw error;
  if (!data || typeof data.source_deleted !== 'boolean' || typeof data.source_retained !== 'boolean' || typeof data.project_name !== 'string') throw new Error('Invalid move response');
  return data;
}
