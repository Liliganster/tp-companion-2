import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ProjectDropRow, ProjectTripTransfer } from './ProjectTripTransfer';
import type { ProjectTripDrag } from '@/lib/moveProjectTrip';
import type { Trip } from '@/contexts/TripsContext';
vi.mock('@/hooks/use-i18n', () => ({ useI18n: () => ({ t: (s: string) => s, tf: (s: string, args: Record<string,string>) => s + ' ' + Object.values(args).join(' ') }) }));
const move = vi.fn();
const trip = { id: 'trip', date: '2026-10-01', route: ['A', 'B'], distance: 20 } as Trip;
function Surface({ busy = false }: { busy?: boolean }) {
  const [dragged, setDragged] = useState<ProjectTripDrag | null>(null);
  return <><ProjectTripTransfer sourceProjectId="source" trips={[trip]} projects={[{id:'source',name:'Source'}, {id:'target',name:'Target'}]} busy={busy} onMove={move} onDrag={setDragged} />
    <table><tbody>{['source','target'].map(id => <ProjectDropRow key={id} projectId={id} dragged={dragged} busy={busy} onMove={move} data-testid={id}><td>{id}</td></ProjectDropRow>)}</tbody></table></>;
}
beforeEach(() => { cleanup(); move.mockReset(); });
it('moves the dragged trip to the destination project', () => {
  render(<Surface />); const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
  fireEvent.dragStart(screen.getByRole('button'), { dataTransfer });
  fireEvent.dragOver(screen.getByTestId('target'), { dataTransfer });
  fireEvent.drop(screen.getByTestId('target'), { dataTransfer });
  expect(move).toHaveBeenCalledWith({tripId:'trip',sourceProjectId:'source'},'target');
  expect(dataTransfer.dropEffect).toBe('move');
});
it('does not move external drops, cancelled drags or a trip onto its own project', () => {
  render(<Surface />); const dataTransfer = { setData: vi.fn() };
  fireEvent.drop(screen.getByTestId('target'), { dataTransfer });
  fireEvent.dragStart(screen.getByRole('button'), { dataTransfer });
  fireEvent.drop(screen.getByTestId('source'), { dataTransfer });
  fireEvent.dragEnd(screen.getByRole('button')); fireEvent.drop(screen.getByTestId('target'), { dataTransfer });
  expect(move).not.toHaveBeenCalled();
});
it('offers the same operation through a keyboard/mobile accessible selector', () => {
  render(<Surface />); fireEvent.change(screen.getByRole('combobox'), { target: { value: 'target' } });
  expect(move).toHaveBeenCalledWith({tripId:'trip',sourceProjectId:'source'},'target');
  expect(screen.getByRole('combobox')).toHaveValue('');
});
it('blocks a second transfer while a move is being saved', () => {
  render(<Surface busy />); expect(screen.getByRole('button')).toBeDisabled(); expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByRole('button')).toHaveAttribute('draggable','false');
  fireEvent.drop(screen.getByTestId('target')); expect(move).not.toHaveBeenCalled();
});
