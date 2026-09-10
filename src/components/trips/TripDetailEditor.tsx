import { useState } from 'react';
import type { Trip } from '@/contexts/TripsContext';
import { useProjects } from '@/contexts/ProjectsContext';
import { useUserProfile } from '@/contexts/UserProfileContext';
import { useI18n } from '@/hooks/use-i18n';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { parseLocaleNumber } from '@/lib/number';

export function TripDetailEditor({ trip, onSave, onCancel, onSaved, onSaving }: {
  trip: Trip;
  onSave: (trip: Trip) => Promise<boolean>;
  onCancel: () => void;
  onSaved: () => void;
  onSaving: (saving: boolean) => void;
}) {
  const { t } = useI18n();
  const { projects, addProject } = useProjects();
  const { profile } = useUserProfile();
  const [date, setDate] = useState(trip.date);
  const [project, setProject] = useState(trip.project);
  const [purpose, setPurpose] = useState(trip.purpose);
  const [route, setRoute] = useState(trip.route.length ? [...trip.route] : ['', '']);
  const [distance, setDistance] = useState(String(trip.distance));
  const [passengers, setPassengers] = useState(String(trip.passengers));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expenses, setExpenses] = useState({
    tollAmount: String(trip.tollAmount ?? ''), parkingAmount: String(trip.parkingAmount ?? ''),
    fuelAmount: String(trip.fuelAmount ?? ''), otherExpenses: String(trip.otherExpenses ?? ''),
  });
  const expenseLabels = { tollAmount: 'tripModal.toll', parkingAmount: 'tripModal.parking', fuelAmount: 'tripModal.fuel', otherExpenses: 'tripModal.otherExpenses' } as const;
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (saving) return;
    const km = parseLocaleNumber(distance);
    const people = parseLocaleNumber(passengers);
    const stops = route.map(stop => stop.trim());
    const amounts = Object.fromEntries(Object.entries(expenses).map(([key, value]) => [key, value.trim() ? parseLocaleNumber(value) : null]));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || stops.length < 2 || stops.some(stop => !stop) || km == null || km < 0 || km > 10000 || people == null || !Number.isInteger(people) || people < 0 || people > 99 || Object.entries(expenses).some(([key, value]) => value.trim() && (amounts[key] == null || amounts[key]! < 0))) {
      setError(t('tripDetail.editInvalid')); return;
    }
    setError(''); setSaving(true); onSaving(true);
    try {
      const name = project.trim();
      let projectId = name === trip.project ? trip.projectId : projects.find(p => p.name.trim().toLowerCase() === name.toLowerCase())?.id;
      if (name && !projectId) {
        projectId = crypto.randomUUID();
        await addProject({ id: projectId, name, ratePerKm: parseLocaleNumber(profile.ratePerKm) ?? 0, starred: false, createdAt: new Date().toISOString(), trips: 0, totalKm: 0, documents: 0, invoices: 0, estimatedCost: 0, shootingDays: 0, kmPerDay: 0, co2Emissions: 0 });
      }
      const saved = await onSave({ ...trip, ...amounts, date, project: name, projectId: name ? projectId : null, purpose, route: stops, distance: km, passengers: people });
      if (saved) onSaved();
      else setError(t('trips.toastTripSaveFailedBody'));
    } catch {
      setError(t('trips.toastTripSaveFailedBody'));
    } finally { setSaving(false); onSaving(false); }
  }}>
    <fieldset disabled={saving} className="space-y-4">
      <div><Label htmlFor="detail-edit-date">{t('tripModal.date')}</Label><Input id="detail-edit-date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
      <div><Label htmlFor="detail-edit-project">{t('tripModal.project')}</Label><Input id="detail-edit-project" list="detail-projects" maxLength={120} value={project} onChange={e => setProject(e.target.value)} /><datalist id="detail-projects">{projects.map(p => <option key={p.id} value={p.name} />)}</datalist></div>
      <div><Label htmlFor="detail-edit-purpose">{t('tripModal.purpose')}</Label><Input id="detail-edit-purpose" maxLength={500} value={purpose} onChange={e => setPurpose(e.target.value)} /></div>
      <div className="space-y-2"><Label>{t('tripDetail.route')}</Label>{route.map((stop, index) => <div className="flex gap-1" key={index}>
        <Input aria-label={`${t('tripDetail.route')} ${index + 1}`} required value={stop} onChange={e => setRoute(prev => prev.map((value, i) => i === index ? e.target.value : value))} />
        <Button type="button" variant="ghost" disabled={route.length <= 2} aria-label={`${t('trips.delete')} ${index + 1}`} onClick={() => setRoute(prev => prev.filter((_, i) => i !== index))}>×</Button>
      </div>)}<Button type="button" variant="outline" onClick={() => setRoute(prev => [...prev.slice(0, -1), '', prev.at(-1)!])}>{t('tripModal.addStop')}</Button></div>
      <div><Label htmlFor="detail-edit-distance">{t('tripModal.distance')}</Label><Input id="detail-edit-distance" inputMode="decimal" required value={distance} onChange={e => setDistance(e.target.value)} /></div>
      <div><Label htmlFor="detail-edit-passengers">{t('trips.passengers')}</Label><Input id="detail-edit-passengers" inputMode="numeric" required value={passengers} onChange={e => setPassengers(e.target.value)} /></div>
      {Object.entries(expenseLabels).map(([key, label]) => <div key={key}><Label htmlFor={`detail-edit-${key}`}>{t(label)} (€)</Label><Input id={`detail-edit-${key}`} inputMode="decimal" value={expenses[key as keyof typeof expenses]} onChange={e => setExpenses(prev => ({ ...prev, [key]: e.target.value }))} /></div>)}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" variant="save">{t('tripModal.save')}</Button><Button type="button" variant="outline" onClick={onCancel}>{t('bulk.cancel')}</Button></div>
    </fieldset>
  </form>;
}
