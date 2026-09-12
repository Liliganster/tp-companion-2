import { describe, expect, it } from 'vitest';
import { groupProjectTrips, resolveLegacyProjectId } from './projectTrips';
import { calculateTripEmissions } from './emissions';

const projects = [{ id: 'a', name: 'New name' }, { id: 'b', name: 'Other' }];
const trips = [
  { id: 'old', projectId: 'a', project: 'Old name', date: '2025-12-31', distance: 100 },
  { id: 'current', projectId: 'a', project: 'Old name', date: '2026-01-01', distance: 50 },
  { id: 'legacy', project: ' NEW NAME ', date: '2026-02-01', distance: 25 },
  { id: 'moved', projectId: 'b', project: 'New name', date: '2026-02-01', distance: 200 },
];

describe('project trip selection and totals', () => {
  it('keeps explicit project IDs authoritative after renaming or moving a trip', () => {
    const groups = groupProjectTrips(trips, projects);
    expect(groups.get('a')!.map(t => t.id)).toEqual(['old', 'current', 'legacy']);
    expect(groups.get('b')!.map(t => t.id)).toEqual(['moved']);
  });

  it('uses the same year for project emissions, distance, days and visible trips', () => {
    const selected = groupProjectTrips(trips, projects, '2026').get('a')!;
    expect(selected.map(t => t.id)).toEqual(['current', 'legacy']);
    expect(selected.reduce((sum, trip) => sum + trip.distance, 0)).toBe(75);
    expect(new Set(selected.map(trip => trip.date)).size).toBe(2);
    const co2 = selected.reduce((sum, trip) => sum + calculateTripEmissions({
      distanceKm: trip.distance, fuelType: 'gasoline', fuelLPer100Km: 7,
    }).co2Kg, 0);
    expect(co2).toBeCloseTo(12.1275, 10);
    expect(groupProjectTrips(trips, projects, '2024').get('a')).toEqual([]);
    expect(groupProjectTrips(trips, projects, 'all').get('a')).toHaveLength(3);
  });

  it('does not merge distinct projects sharing a name or count legacy trips twice', () => {
    const duplicateNames = [{ id: 'a', name: 'Same' }, { id: 'b', name: 'Same' }];
    const groups = groupProjectTrips([
      { projectId: 'a', project: 'Same', date: '2026-01-01' },
      { projectId: 'b', project: 'Same', date: '2026-01-01' },
      { project: 'Same', date: '2026-01-01' },
    ], duplicateNames);
    expect(groups.get('a')).toHaveLength(1);
    expect(groups.get('b')).toHaveLength(1);
    expect(resolveLegacyProjectId(duplicateNames, 'same')).toBeUndefined();
  });

  it('does not reassign an unknown explicit ID or an unmatched legacy name', () => {
    expect(groupProjectTrips([
      { projectId: 'missing', project: 'New name', date: '2026-01-01' },
      { project: 'Unknown', date: '2026-01-01' },
      { project: '', date: '2026-01-01' },
    ], projects).get('a')).toEqual([]);
  });
});
