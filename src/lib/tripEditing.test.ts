import { describe, expect, it, vi } from 'vitest';
import { resolveEditedTripProjectId, isValidTripEdit } from './tripEditing';

describe('shared trip editor project rules', () => {
  it('keeps an explicit association even when another project has the old name', async () => {
    const create = vi.fn();
    expect(await resolveEditedTripProjectId('Film', { project: 'Film', projectId: 'original' }, [{ id: 'other', name: 'Film' }], create)).toBe('original');
    expect(create).not.toHaveBeenCalled();
  });
  it('clears the association explicitly when the user removes the name', async () => {
    expect(await resolveEditedTripProjectId(' ', { project: 'Film', projectId: 'original' }, [], vi.fn())).toBeNull();
  });
  it('switches to a unique existing project when the user changes the name', async () => {
    expect(await resolveEditedTripProjectId('Other', { project: 'Film', projectId: 'original' }, [{ id: 'other', name: 'Other' }], vi.fn())).toBe('other');
  });
  it('uses the persisted server ID for a missing or ambiguous local match', async () => {
    const create = vi.fn().mockResolvedValue('server');
    expect(await resolveEditedTripProjectId('Film', null, [{ id: 'a', name: 'Film' }, { id: 'b', name: 'FILM' }], create)).toBe('server');
    expect(create).toHaveBeenCalledOnce();
  });
});
describe('shared trip editor validation', () => {
  const input = { date: '2026-10-01', route: ['Studio'], distance: 0, passengers: 0, documentTrip: true, expenses: [] };
  it('allows a single document location with no distance and preserves manual trip requirements', () => {
    expect(isValidTripEdit(input)).toBe(true);
    expect(isValidTripEdit({ ...input, documentTrip: false })).toBe(false);
  });
  it.each([
    { date: '2026-02-31' }, { route: ['A', '', 'B'] }, { distance: null },
    { distance: -1 }, { passengers: 1.5 }, { passengers: 100 },
    { expenses: [{ raw: 'invalid', value: null }] }, { expenses: [{ raw: '-2', value: -2 }] },
  ])('rejects invalid edits %j in both editors', patch => { expect(isValidTripEdit({ ...input, ...patch })).toBe(false); });
});
