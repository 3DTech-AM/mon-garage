import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Bell, BellOff, Check, Clock, TrendingUp, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Vehicle, Reminder, ReminderStatus } from '@/types/database';
import { MAINTENANCE_CATEGORIES, REMINDER_PRESETS_DAYS, REMINDER_PRESET_KM } from '@/types/database';
import { FormSheet, Field, inputClass } from '@/components/FormSheet';
import { useModal } from '@/context/ModalContext';
import {
  getReminderStatus, STATUS_LABELS, STATUS_COLORS,
  formatDate, formatMileage, daysUntil, kmUntil,
} from '@/lib/reminder';

export default function RemindersScreen() {
  const { confirm } = useModal();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [showComplete, setShowComplete] = useState<Reminder | null>(null);

  async function loadData() {
    setLoading(true);
    const [rRes, vRes] = await Promise.all([
      supabase.from('reminders').select('*').order('created_at', { ascending: false }),
      supabase.from('vehicles').select('*').order('created_at', { ascending: true }),
    ]);
    setReminders(rRes.data || []);
    setVehicles(vRes.data || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const vehicleMap = new Map(vehicles.map(v => [v.id, v]));

  const activeReminders = reminders
    .filter(r => !r.completed)
    .map(r => ({
      ...r,
      vehicle: vehicleMap.get(r.vehicle_id),
      status: getReminderStatus(r, vehicleMap.get(r.vehicle_id)?.mileage || 0),
    }))
    .sort((a, b) => {
      const priority: Record<ReminderStatus, number> = { en_retard: 3, a_effectuer: 2, prochainement: 1, a_jour: 0 };
      return (priority[b.status] || 0) - (priority[a.status] || 0);
    });

  const completedReminders = reminders.filter(r => r.completed);

  async function handleDelete(reminder: Reminder) {
    confirm({
      title: 'Supprimer le rappel',
      message: `Voulez-vous vraiment supprimer ce rappel « ${reminder.type} » ?`,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        await supabase.from('reminders').delete().eq('id', reminder.id);
        loadData();
      },
    });
  }

  async function toggleActive(reminder: Reminder) {
    await supabase.from('reminders').update({ active: !reminder.active, updated_at: new Date().toISOString() }).eq('id', reminder.id);
    loadData();
  }

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Échéances</h1>
        <button
          onClick={() => { setEditingReminder(null); setShowForm(true); }}
          className="flex items-center gap-1.5 bg-blue-800 text-white px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-blue-900 transition-colors active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Nouveau
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Aucun véhicule</p>
          <p className="text-sm text-slate-400 mt-1">Ajoutez d'abord un véhicule</p>
        </div>
      ) : activeReminders.length === 0 && completedReminders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Aucune échéance</p>
          <p className="text-sm text-slate-400 mt-1">Créez un rappel pour suivre vos entretiens à venir</p>
        </div>
      ) : (
        <>
          {activeReminders.length > 0 && (
            <div className="space-y-3 mb-6">
              {activeReminders.map(r => {
                const vehicle = vehicleMap.get(r.vehicle_id);
                const dLeft = daysUntil(r.target_date);
                const kLeft = kmUntil(r.target_mileage, vehicle?.mileage || 0);
                return (
                  <div key={r.id} className={`bg-white rounded-2xl border-2 p-4 transition-all ${
                    r.status === 'en_retard' ? 'border-red-200' :
                    r.status === 'a_effectuer' ? 'border-orange-200' :
                    'border-slate-200'
                  } ${!r.active ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900">{r.type}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[r.status]}`}>
                            {STATUS_LABELS[r.status]}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500">
                          {vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Inconnu'}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => toggleActive(r)}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                          title={r.active ? 'Désactiver' : 'Activer'}
                        >
                          {r.active ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => { setEditingReminder(r); setShowForm(true); }}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-4 mt-2 text-xs text-slate-500">
                      {r.target_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(r.target_date)}
                          {dLeft !== null && (
                            <span className={dLeft < 0 ? 'text-red-600 font-medium' : dLeft <= r.alert_days_threshold ? 'text-orange-600 font-medium' : ''}>
                              {dLeft < 0 ? ` (retard ${Math.abs(dLeft)}j)` : dLeft === 0 ? " (aujourd'hui)" : ` (${dLeft}j)`}
                            </span>
                          )}
                        </span>
                      )}
                      {r.target_mileage != null && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          {formatMileage(r.target_mileage)}
                          {kLeft !== null && (
                            <span className={kLeft < 0 ? 'text-red-600 font-medium' : kLeft <= r.alert_km_threshold ? 'text-orange-600 font-medium' : ''}>
                              {kLeft < 0 ? ` (dépassé ${Math.abs(kLeft)}km)` : ` (${kLeft}km)`}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {r.active && (r.status === 'en_retard' || r.status === 'a_effectuer') && (
                      <button
                        onClick={() => setShowComplete(r)}
                        className="mt-3 flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 px-3 py-2 rounded-lg hover:bg-green-100 transition-colors w-full justify-center"
                      >
                        <Check className="w-4 h-4" />
                        Marquer comme effectué
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {completedReminders.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Historique des échéances</h2>
              <div className="space-y-2">
                {completedReminders.slice(0, 10).map(r => {
                  const vehicle = vehicleMap.get(r.vehicle_id);
                  return (
                    <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3 opacity-60">
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{r.type}</p>
                        <p className="text-xs text-slate-400">
                          {vehicle ? `${vehicle.brand} ${vehicle.model}` : ''} • Effectué le {formatDate(r.completed_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {showForm && (
        <ReminderForm
          reminder={editingReminder}
          vehicles={vehicles}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      )}

      {showComplete && (
        <CompleteReminderSheet
          reminder={showComplete}
          vehicle={vehicleMap.get(showComplete.vehicle_id)}
          onClose={() => setShowComplete(null)}
          onDone={() => { setShowComplete(null); loadData(); }}
        />
      )}
    </div>
  );
}

function ReminderForm({
  reminder,
  vehicles,
  onClose,
  onSaved,
}: {
  reminder: Reminder | null;
  vehicles: Vehicle[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vehicleId, setVehicleId] = useState(reminder?.vehicle_id || vehicles[0]?.id || '');
  const [type, setType] = useState(reminder?.type || MAINTENANCE_CATEGORIES[0]);
  const [customType, setCustomType] = useState('');
  const [targetMileage, setTargetMileage] = useState(reminder?.target_mileage?.toString() || '');
  const [targetDate, setTargetDate] = useState(reminder?.target_date || '');
  const [alertKm, setAlertKm] = useState(reminder?.alert_km_threshold?.toString() || REMINDER_PRESET_KM.toString());
  const [alertDays, setAlertDays] = useState(reminder?.alert_days_threshold?.toString() || REMINDER_PRESETS_DAYS[0].toString());
  const [nextIntervalKm, setNextIntervalKm] = useState(reminder?.next_interval_km?.toString() || '');
  const [nextIntervalDays, setNextIntervalDays] = useState(reminder?.next_interval_days?.toString() || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCustom = type === '__custom__';
  const finalType = isCustom ? customType.trim() : type;

  const handleSave = async () => {
    setError(null);
    if (!vehicleId) { setError('Sélectionnez un véhicule.'); return; }
    if (isCustom && !customType.trim()) { setError('Saisissez un nom de catégorie.'); return; }
    if (!targetMileage && !targetDate) { setError('Renseignez au moins une date cible ou un kilométrage cible.'); return; }

    setSaving(true);
    const payload = {
      vehicle_id: vehicleId,
      type: finalType,
      target_mileage: targetMileage ? parseInt(targetMileage) : null,
      target_date: targetDate || null,
      alert_km_threshold: parseInt(alertKm) || 1000,
      alert_days_threshold: parseInt(alertDays) || 30,
      next_interval_km: nextIntervalKm ? parseInt(nextIntervalKm) : null,
      next_interval_days: nextIntervalDays ? parseInt(nextIntervalDays) : null,
    };

    if (reminder) {
      const { error } = await supabase.from('reminders').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', reminder.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('reminders').insert(payload);
      if (error) { setError(error.message); setSaving(false); return; }
    }
    setSaving(false);
    onSaved();
  };

  return (
    <FormSheet
      open
      title={reminder ? 'Modifier l\'échéance' : 'Nouvelle échéance'}
      onClose={onClose}
      footer={
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-blue-800 text-white rounded-xl font-medium hover:bg-blue-900 disabled:opacity-50 transition-colors active:scale-[0.98]"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      }
    >
      <Field label="Véhicule *">
        <select className={inputClass} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>{v.brand} {v.model}{v.registration ? ` (${v.registration})` : ''}</option>
          ))}
        </select>
      </Field>
      <Field label="Type d'entretien *">
        <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
          {MAINTENANCE_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
          <option value="__custom__">Catégorie personnalisée…</option>
        </select>
      </Field>
      {isCustom && (
        <Field label="Nom de la catégorie">
          <input className={inputClass} value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="Ex: Amortisseurs" />
        </Field>
      )}

      <div className="border-t border-slate-100 pt-4 mt-4">
        <p className="text-sm font-medium text-slate-700 mb-3">Cible (au moins une des deux)</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kilométrage cible">
            <input className={inputClass} type="number" value={targetMileage} onChange={(e) => setTargetMileage(e.target.value)} placeholder="Ex: 120000" />
          </Field>
          <Field label="Date cible">
            <input className={inputClass} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4 mt-4">
        <p className="text-sm font-medium text-slate-700 mb-3">Seuils d'alerte</p>
        <Field label="Alerte kilométrique (km avant)">
          <input className={inputClass} type="number" value={alertKm} onChange={(e) => setAlertKm(e.target.value)} placeholder="1000" />
        </Field>
        <Field label="Alerte temporelle (jours avant)" hint="L'alerte se déclenche dès que l'un des deux seuils est atteint.">
          <input className={inputClass} type="number" value={alertDays} onChange={(e) => setAlertDays(e.target.value)} placeholder="30" />
        </Field>
      </div>

      <div className="border-t border-slate-100 pt-4 mt-4">
        <p className="text-sm font-medium text-slate-700 mb-1">Prochaine échéance (facultatif)</p>
        <p className="text-xs text-slate-400 mb-3">Intervalle utilisé pour créer automatiquement la prochaine échéance après exécution.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Intervalle (km)">
            <input className={inputClass} type="number" value={nextIntervalKm} onChange={(e) => setNextIntervalKm(e.target.value)} placeholder="Ex: 15000" />
          </Field>
          <Field label="Intervalle (jours)">
            <input className={inputClass} type="number" value={nextIntervalDays} onChange={(e) => setNextIntervalDays(e.target.value)} placeholder="Ex: 365" />
          </Field>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </FormSheet>
  );
}

function CompleteReminderSheet({
  reminder,
  vehicle,
  onClose,
  onDone,
}: {
  reminder: Reminder;
  vehicle: Vehicle | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mileage, setMileage] = useState(vehicle?.mileage?.toString() || '');
  const [description, setDescription] = useState('');
  const [partsReplaced, setPartsReplaced] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async () => {
    setError(null);
    setSaving(true);

    // 1. Mark reminder as completed
    const { error: e1 } = await supabase.from('reminders').update({
      completed: true,
      completed_at: new Date().toISOString(),
      active: false,
      updated_at: new Date().toISOString(),
    }).eq('id', reminder.id);
    if (e1) { setError(e1.message); setSaving(false); return; }

    // 2. Create maintenance record
    const mileageNum = mileage ? parseInt(mileage) : null;
    const { error: e2 } = await supabase.from('maintenance_records').insert({
      vehicle_id: reminder.vehicle_id,
      date,
      mileage: mileageNum,
      type: reminder.type,
      description: description.trim() || null,
      parts_replaced: partsReplaced.trim() || null,
      cost: cost ? parseFloat(cost) : null,
      notes: notes.trim() || null,
    });
    if (e2) { setError(e2.message); setSaving(false); return; }

    // 3. Update vehicle mileage if provided and higher
    if (mileageNum != null && vehicle && mileageNum > vehicle.mileage) {
      await supabase.from('vehicles').update({
        mileage: mileageNum,
        mileage_updated_at: new Date().toISOString(),
      }).eq('id', reminder.vehicle_id);
    }

    // 4. Create next reminder if intervals are set
    if (reminder.next_interval_km || reminder.next_interval_days) {
      const nextTargetMileage = reminder.next_interval_km
        ? (mileageNum || vehicle?.mileage || 0) + reminder.next_interval_km
        : null;
      const nextTargetDate = reminder.next_interval_days
        ? new Date(Date.now() + reminder.next_interval_days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : null;

      await supabase.from('reminders').insert({
        vehicle_id: reminder.vehicle_id,
        type: reminder.type,
        target_mileage: nextTargetMileage,
        target_date: nextTargetDate,
        alert_km_threshold: reminder.alert_km_threshold,
        alert_days_threshold: reminder.alert_days_threshold,
        next_interval_km: reminder.next_interval_km,
        next_interval_days: reminder.next_interval_days,
      });
    }

    setSaving(false);
    onDone();
  };

  return (
    <FormSheet
      open
      title="Marquer l'entretien comme effectué"
      onClose={onClose}
      footer={
        <button
          onClick={handleComplete}
          disabled={saving}
          className="w-full py-3 bg-green-700 text-white rounded-xl font-medium hover:bg-green-800 disabled:opacity-50 transition-colors active:scale-[0.98]"
        >
          {saving ? 'Enregistrement…' : 'Confirmer l\'entretien'}
        </button>
      }
    >
      <div className="mb-4 p-3 bg-blue-50 rounded-xl text-sm text-blue-800">
        <p className="font-medium">{reminder.type}</p>
        <p className="mt-0.5">{vehicle ? `${vehicle.brand} ${vehicle.model}` : ''}</p>
      </div>
      <p className="text-sm text-slate-600 mb-4">
        Cet entretien sera enregistré dans l'historique. L'échéance actuelle sera clôturée
        {(reminder.next_interval_km || reminder.next_interval_days) && ' et la prochaine sera créée automatiquement.'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date d'exécution">
          <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Kilométrage">
          <input className={inputClass} type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="—" />
        </Field>
      </div>
      <Field label="Description (facultatif)">
        <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description des travaux" />
      </Field>
      <Field label="Pièces remplacées (facultatif)">
        <input className={inputClass} value={partsReplaced} onChange={(e) => setPartsReplaced(e.target.value)} placeholder="Pièces" />
      </Field>
      <Field label="Coût (€, facultatif)">
        <input className={inputClass} type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
      </Field>
      <Field label="Remarques (facultatif)">
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </FormSheet>
  );
}
