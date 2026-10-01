import { expect, it, vi } from 'vitest';
import { moveProjectTrip } from './moveProjectTrip';
it('uses one server transaction and returns only a confirmed result', async () => {
  const data = {source_deleted:true,source_retained:false,project_name:'Target'};
  const rpc=vi.fn().mockResolvedValue({data,error:null});
  expect(await moveProjectTrip({rpc} as any,{tripId:'trip',sourceProjectId:'source'},'target')).toEqual(data);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('move_trip_to_project',{p_trip_id:'trip',p_source_project_id:'source',p_target_project_id:'target'});
});
it('propagates errors without a partial client-side move/delete fallback', async () => {
  const error={code:'PGRST202'}; const rpc=vi.fn().mockResolvedValue({data:null,error});
  await expect(moveProjectTrip({rpc} as any,{tripId:'trip',sourceProjectId:'source'},'target')).rejects.toEqual(error);
  expect(rpc).toHaveBeenCalledOnce();
});
it('rejects malformed success responses', async () => {
  await expect(moveProjectTrip({rpc:vi.fn().mockResolvedValue({data:{},error:null})} as any,{tripId:'trip',sourceProjectId:'source'},'target')).rejects.toThrow('Invalid move response');
});
