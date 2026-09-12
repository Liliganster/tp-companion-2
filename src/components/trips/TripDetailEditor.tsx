import { FormSection } from "@/components/ui/form-section";
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
  return <form className="flex h-full min-h-0 flex-col" onSubmit={async event => {
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
    <fieldset disabled={saving} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div><Label htmlFor="detail-edit-date">{t('tripModal.date')}</Label><Input id="detail-edit-date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
      <div><Label htmlFor="detail-edit-project">{t('tripModal.project')}</Label><Input id="detail-edit-project" list="detail-projects" maxLength={120} value={project} onChange={e => setProject(e.target.value)} /><datalist id="detail-projects">{projects.map(p => <option key={p.id} value={p.name} />)}</datalist></div>
      </div>
      <div><Label htmlFor="detail-edit-purpose">{t('tripModal.purpose')}</Label><Input id="detail-edit-purpose" maxLength={500} value={purpose} onChange={e => setPurpose(e.target.value)} /></div>
      <div className="space-y-2"><Label>{t('tripDetail.route')}</Label>{route.map((stop, index) => <div className="flex items-start gap-2" key={index}>
        <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{index + 1}</span>
        <textarea rows={2} className="flex min-h-16 w-full resize-y rounded-lg border border-input bg-secondary px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" aria-label={`${t('tripDetail.route')} ${index + 1}`} required value={stop} onChange={e => setRoute(prev => prev.map((value, i) => i === index ? e.target.value : value))} />
        <Button type="button" variant="ghost" disabled={route.length <= 2} aria-label={`${t('trips.delete')} ${index + 1}`} onClick={() => setRoute(prev => prev.filter((_, i) => i !== index))}>×</Button>
      </div>)}<Button type="button" variant="outline" onClick={() => setRoute(prev => [...prev.slice(0, -1), '', prev.at(-1)!])}>{t('tripModal.addStop')}</Button></div>
      <div className="grid grid-cols-2 gap-4">
      <div><Label htmlFor="detail-edit-distance">{t('tripModal.distance')}</Label><Input id="detail-edit-distance" inputMode="decimal" required value={distance} onChange={e => setDistance(e.target.value)} /></div>
      <div><Label htmlFor="detail-edit-passengers">{t('trips.passengers')}</Label><Input id="detail-edit-passengers" inputMode="numeric" required value={passengers} onChange={e => setPassengers(e.target.value)} /></div>
      </div>
      <FormSection title={t("tripModal.expenses")} reveal={Object.values(expenses).some(value => value !== "" && value !== "0")}>
      <div className="grid grid-cols-2 gap-4">
      {Object.entries(expenseLabels).map(([key, label]) => <div key={key}><Label htmlFor={`detail-edit-${key}`}>{t(label)}</Label><Input id={`detail-edit-${key}`} inputMode="decimal" value={expenses[key as keyof typeof expenses]} onChange={e => setExpenses(prev => ({ ...prev, [key]: e.target.value }))} /></div>)}
      </div></FormSection>
    </fieldset>
    <div className="shrink-0 space-y-2 border-t border-border bg-card p-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button disabled={saving} type="button" variant="outline" onClick={onCancel}>{t('bulk.cancel')}</Button><Button disabled={saving} type="submit" variant="save">{t('tripModal.save')}</Button></div>
    </div>
  </form>;
}
