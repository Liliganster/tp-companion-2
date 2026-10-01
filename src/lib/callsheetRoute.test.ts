import { expect, it } from 'vitest';
import { buildCallsheetRoute, buildBaseRouteAddress, isBaseRouteAddress } from './callsheetRoute';
const profile = {baseAddress:'Hauptstr. 12',city:'Wien',country:'Austria'};
const base = 'Hauptstr. 12, Wien, Austria';
it.each([
  [['Hauptstraße 12','Studio 8','Hauptstr.12'], [base,'Studio 8',base]],
  [['Studio 8'], [base,'Studio 8',base]],
  [['Studio 8','studio 8'], [base,'Studio 8',base]],
  [['Studio 8','Park 2','Studio 8'], [base,'Studio 8','Park 2','Studio 8',base]],
  [['Studio 8','Hauptstr. 12','Park 2'], [base,'Studio 8',base,'Park 2',base]],
  [['Hauptstr.12','Hauptstraße 12'], [base]],
  [['Hauptstraße 120'], [base,'Hauptstraße 120',base]],
  [['Hauptstraße 12, Graz'], [base,'Hauptstraße 12, Graz',base]],
])('builds a route without duplicate endpoints and preserves real return visits: %j', (locations, expected) => {
  expect(buildCallsheetRoute(profile, locations)).toEqual(expected);
});
it('does not infer a base when none is configured', () => {
  expect(buildCallsheetRoute({},['Park 1','park 1','Studio 2','Park 1'])).toEqual(['Park 1','Studio 2','Park 1']);
});
it('does not duplicate city and country already written in the base', () => {
  expect(buildBaseRouteAddress({baseAddress:base,city:'Wien',country:'Austria'})).toBe(base);
  expect(isBaseRouteAddress(profile,'Hauptstraße 12, Wien, Austria')).toBe(true);
});
it('leaves the extracted evidence array intact', () => {
  const rows=['Hauptstr. 12','Studio 8','Studio 8','Hauptstr. 12'];
  buildCallsheetRoute(profile,rows);
  expect(rows).toEqual(['Hauptstr. 12','Studio 8','Studio 8','Hauptstr. 12']);
});
