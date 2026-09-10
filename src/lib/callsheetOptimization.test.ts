import {afterEach,expect,it,vi} from 'vitest';
import {optimizeCallsheetLocationsAndDistance} from './callsheetOptimization';
afterEach(()=>vi.unstubAllGlobals());
it('uses document waypoints in order without autocomplete, replacement or appended city',async()=>{
  const request=vi.fn(async(_url:unknown,init:RequestInit)=>{
    expect(JSON.parse(String(init.body)).waypoints).toEqual(['Stadtpark','48.2082, 16.3738']);
    return new Response(JSON.stringify({totalDistanceMeters:12300}));
  });
  vi.stubGlobal('fetch',request);
  const result=await optimizeCallsheetLocationsAndDistance({profile:{baseAddress:'Base 1',city:'Elsewhere',country:'Austria'},rawLocations:['Stadtpark','48.2082, 16.3738'],accessToken:'mock'});
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0]).toBe('/api/google/directions');
  expect(result).toEqual({locations:['Stadtpark','48.2082, 16.3738'],distanceKm:12.3});
});
it('preserves useful locations when distance calculation fails',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline')}));
  expect(await optimizeCallsheetLocationsAndDistance({profile:{baseAddress:'Base 1'},rawLocations:['Opera'],accessToken:'mock'})).toEqual({locations:['Opera'],distanceKm:null});
});
