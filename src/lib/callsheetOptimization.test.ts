import {afterEach,expect,it,vi} from 'vitest';
import {optimizeCallsheetLocationsAndDistance} from './callsheetOptimization';
import {normalizeCallsheetAddress,callsheetAddressKey} from './callsheetAddress';
afterEach(()=>vi.unstubAllGlobals());
it('normalizes printed formats without inventing missing city or postcode',()=>{
 expect(normalizeCallsheetAddress('1080 Wien, Josefsagasse12')).toBe('Josefsagasse 12, 1080 Wien');
 expect(normalizeCallsheetAddress('Lichtenfelsgasse Ecke Rathausplatz')).toBe('Lichtenfelsgasse & Rathausplatz');
 expect(normalizeCallsheetAddress('Stadtpark')).toBe('Stadtpark');
 expect(normalizeCallsheetAddress('2., Rustenschacherallee 9')).toBe('2., Rustenschacherallee 9');
 expect(callsheetAddressKey('Hauptstr.12, Wien')).toBe(callsheetAddressKey('Hauptstraße 12, Wien'));
 expect(callsheetAddressKey('Street 6C')).not.toBe(callsheetAddressKey('Street 8'));
 expect(callsheetAddressKey('48.1, 16.2')).not.toBe(callsheetAddressKey('4.81, 16.2'));
});
it('deduplicates spelling variants before geocoding and uses a single resolved place for routing',async()=>{
 const request=vi.fn(async(url:unknown,init:RequestInit)=>{
  if(url==='/api/google/geocode') return new Response(JSON.stringify({resultCount:1,partialMatch:false,placeId:'place-12',formattedAddress:'Josefsagasse 12, 1080 Wien, Austria',types:['street_address']}));
  expect(JSON.parse(String(init.body)).waypoints).toEqual(['place_id:place-12','48.2082, 16.3738']);
  return new Response(JSON.stringify({totalDistanceMeters:12300}));
 });
 vi.stubGlobal('fetch',request);
 const result=await optimizeCallsheetLocationsAndDistance({profile:{baseAddress:'Base 1',country:'Austria'},rawLocations:['1080 Wien, Josefsagasse12','Josefsagasse 12, 1080 Wien','48.2082, 16.3738'],accessToken:'mock'});
 expect(request).toHaveBeenCalledTimes(2);
 expect(result).toEqual({locations:['Josefsagasse 12, 1080 Wien, Austria','48.2082, 16.3738'],distanceKm:12.3});
});
it.each([{resultCount:2,partialMatch:false},{resultCount:1,partialMatch:true},{resultCount:1,partialMatch:false,types:['locality']}])('does not replace ambiguous or city-only geocodes: %o',async flags=>{
 vi.stubGlobal('fetch',vi.fn(async(url:unknown)=>new Response(JSON.stringify(url==='/api/google/geocode'?{placeId:'wrong',formattedAddress:'Wrong Place',types:['street_address'],...flags}:{totalDistanceMeters:1000}))));
 const result=await optimizeCallsheetLocationsAndDistance({profile:{baseAddress:'Base'},rawLocations:['Street12'],accessToken:'mock'});
 expect(result.locations).toEqual(['Street 12']);
});
it('preserves different street numbers and original order without network access',async()=>{
 expect(await optimizeCallsheetLocationsAndDistance({profile:{},rawLocations:['Street 6C','Street 8','Street 6C']})).toEqual({locations:['Street 6C','Street 8'],distanceKm:null});
});
it('preserves useful locations when distance calculation fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline')}));
 expect(await optimizeCallsheetLocationsAndDistance({profile:{baseAddress:'Base 1'},rawLocations:['Opera'],accessToken:'mock'})).toEqual({locations:['Opera'],distanceKm:null});
});
