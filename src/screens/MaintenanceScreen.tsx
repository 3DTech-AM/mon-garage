import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Wrench, Check, CalendarClock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Vehicle, MaintenanceRecord } from '@/types/database';
import { MAINTENANCE_CATEGORIES, REMINDER_PRESET_KM } from '@/types/database';
import { FormSheet, Field, inputClass } from '@/components/FormSheet';
import { useModal } from '@/context/ModalContext';
import { formatDate, formatMileage, formatCost } from '@/lib/reminder';

/** Parse a type string into an array of individual types. */
function parseTypes(typeStr: string): string[] {
  return typeStr.split(',').map(t => t.trim()).filter(Boolean);
}

export default function MaintenanceScreen() {
  const { confirm } = useModal();
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);
  const [filterVehicle, setFilterVehicle] = useState<string>('all');

  async function loadData() {
    setLoading(true);
    const [mRes, vRes] = await Promise.all([
      supabase.from('maintenance_records').select('*').order('date', { ascending: false }),
      supabase.from('vehicles').select('*').order('created_at', { ascending: true }),
    ]);
    setRecords(mRes.data || []);
    setVehicles(vRes.data || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const vehicleMap = new Map(vehicles.map(v => [v.id, v]));
  const filteredRecords = filterVehicle === 'all' ? records : records.filter(r => r.vehicle_id === filterVehicle);

  async function handleDelete(record: MaintenanceRecord) {
    confirm({
      title: 'Supprimer l\'entretien',
      message: `Voulez-vous vraiment supprimer cet entretien « ${record.type} » du ${formatDate(record.date)} ?`,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        await supabase.from('maintenance_records').delete().eq('id', record.id);
        loadData();
      },
    });
  }

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Entretiens</h1>
        <button
          onClick={() => { setEditingRecord(null); setShowForm(true); }}
          className="flex items-center gap-1.5 bg-blue-800 text-white px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-blue-900 transition-colors active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Nouveau
        </button>
      </div>

      {vehicles.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterVehicle('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filterVehicle === 'all' ? 'bg-blue-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            Tous
          </button>
          {vehicles.map(v => (
            <button
              key={v.id}
              onClick={() => setFilterVehicle(v.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                filterVehicle === v.id ? 'bg-blue-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {v.brand} {v.model}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Aucun entretien enregistré</p>
          <p className="text-sm text-slate-400 mt-1">Ajoutez votre premier entretien pour démarrer l'historique</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map(record => {
            const vehicle = vehicleMap.get(record.vehicle_id);
            const types = parseTypes(record.type);
            return (
              <div key={record.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {types.map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md">
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-slate-500">
                      {formatDate(record.date)} • {vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Inconnu'}
                      {record.mileage != null && ` • ${formatMileage(record.mileage)}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { setEditingRecord(record); setShowForm(true); }}
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(record)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {record.description && <p className="text-sm text-slate-700 mt-2">{record.description}</p>}
                {record.parts_replaced && (
                  <p className="text-sm text-slate-500 mt-1">
                    <span className="text-slate-400">Pièces : </span>{record.parts_replaced}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                  {record.cost != null ? (
                    <span className="text-sm font-medium text-slate-700">{formatCost(record.cost)}</span>
                  ) : <span />}
                  {record.notes && <span className="text-xs text-slate-400 truncate ml-2">{record.notes}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <MaintenanceForm
          record={editingRecord}
          vehicles={vehicles}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      )}
    </div>
  );
}

function MaintenanceForm({
  record,
  vehicles,
  onClose,
  onSaved,
}: {
  record: MaintenanceRecord | null;
  vehicles: Vehicle[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Parse existing record types into a Set for multi-select; default to first category for new records
  const existingTypes = record ? parseTypes(record.type) : [];
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    new Set(existingTypes.length > 0 ? existingTypes : [MAINTENANCE_CATEGORIES[0]])
  );
  const [customTypes, setCustomTypes] = useState<string[]>(
    existingTypes.filter(t => !MAINTENANCE_CATEGORIES.includes(t as typeof MAINTENANCE_CATEGORIES[number]))
  );
  const [customTypeInput, setCustomTypeInput] = useState('');

  const [vehicleId, setVehicleId] = useState(record?.vehicle_id || vehicles[0]?.id || '');
  const [date, setDate] = useState(record?.date || new Date().toISOString().slice(0, 10));
  const [mileage, setMileage] = useState(record?.mileage?.toString() || '');
  const [description, setDescription] = useState(record?.description || '');
  const [partsReplaced, setPartsReplaced] = useState(record?.parts_replaced || '');
  const [cost, setCost] = useState(record?.cost?.toString() || '');
  const [notes, setNotes] = useState(record?.notes || '');

  // Schedule next maintenance
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextMileage, setNextMileage] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleType(type: string) {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function addCustomType() {
    const trimmed = customTypeInput.trim();
    if (!trimmed) return;
    if (selectedTypes.has(trimmed) || customTypes.includes(trimmed)) return;
    setCustomTypes(prev => [...prev, trimmed]);
    setSelectedTypes(prev => new Set(prev).add(trimmed));
    setCustomTypeInput('');
  }

  function removeCustomType(type: string) {
    setCustomTypes(prev => prev.filter(t => t !== type));
    setSelectedTypes(prev => {
      const next = new Set(prev);
      next.delete(type);
      if (next.size === 0) next.add(MAINTENANCE_CATEGORIES[0]);
      return next;
    });
  }

  const allSelectedTypes = Array.from(selectedTypes);
  const mileageNum = mileage ? parseInt(mileage) : null;
  const nextMileageNum = nextMileage ? parseInt(nextMileage) : null;

  const handleSave = async () => {
    setError(null);
    if (!vehicleId) { setError('Sélectionnez un véhicule.'); return; }
    if (allSelectedTypes.length === 0) { setError('Sélectionnez au moins une intervention.'); return; }

    if (scheduleNext) {
      if (!nextMileageNum || nextMileageNum <= 0) {
        setError('Indiquez le kilométrage du prochain entretien.'); return;
      }
      if (mileageNum != null && nextMileageNum <= mileageNum) {
        setError('Le kilométrage du prochain entretien doit être supérieur au kilométrage actuel.'); return;
      }
    }

    setSaving(true);
    const typeString = allSelectedTypes.join(', ');
    const payload = {
      vehicle_id: vehicleId,
      date,
      mileage: mileageNum,
      type: typeString,
      description: description.trim() || null,
      parts_replaced: partsReplaced.trim() || null,
      cost: cost ? parseFloat(cost) : null,
      notes: notes.trim() || null,
    };

    if (record) {
      const { error } = await supabase.from('maintenance_records').update(payload).eq('id', record.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('maintenance_records').insert(payload);
      if (error) { setError(error.message); setSaving(false); return; }
    }

    // Update vehicle mileage if provided and higher
    if (mileageNum != null && mileageNum > 0) {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (vehicle && mileageNum > vehicle.mileage) {
        await supabase.from('vehicles').update({
          mileage: mileageNum,
          mileage_updated_at: new Date().toISOString(),
        }).eq('id', vehicleId);
      }
    }

    // Create reminder for next maintenance if requested (only for new records)
    if (scheduleNext && nextMileageNum && !record) {
      // Check for duplicate: active, non-completed reminder with same vehicle + target_mileage
      const { data: existing } = await supabase
        .from('reminders')
        .select('id')
        .eq('vehicle_id', vehicleId)
        .eq('target_mileage', nextMileageNum)
        .eq('active', true)
        .eq('completed', false)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { error: reminderError } = await supabase.from('reminders').insert({
          vehicle_id: vehicleId,
          type: typeString,
          target_mileage: nextMileageNum,
          alert_km_threshold: REMINDER_PRESET_KM,
        });
        if (reminderError) {
          // Don't block the whole save, but surface the error
          setError(`Entretien enregistré, mais échec de la création du rappel : ${reminderError.message}`);
          setSaving(false);
          onSaved();
          return;
        }
      }
    }

    setSaving(false);
    onSaved();
  };

  if (vehicles.length === 0) {
    return (
      <FormSheet open title="Nouvel entretien" onClose={onClose}>
        <p className="text-slate-600 text-center py-8">Ajoutez d'abord un véhicule avant d'enregistrer un entretien.</p>
      </FormSheet>
    );
  }

  return (
    <FormSheet
      open
      title={record ? 'Modifier l\'entretien' : 'Nouvel entretien'}
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date *">
          <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Kilométrage">
          <input className={inputClass} type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="—" />
        </Field>
      </div>

      {/* Multi-select types */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">Types d'intervention *</label>
        <div className="grid grid-cols-1 gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-56 overflow-y-auto">
          {MAINTENANCE_CATEGORIES.map(cat => (
            <label
              key={cat}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedTypes.has(cat) ? 'bg-blue-100' : 'hover:bg-slate-100'
              }`}
            >
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                selectedTypes.has(cat) ? 'bg-blue-700 border-blue-700' : 'border-slate-300 bg-white'
              }`}>
                {selectedTypes.has(cat) && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </div>
              <span className="text-sm text-slate-700">{cat}</span>
              <input
                type="checkbox"
                checked={selectedTypes.has(cat)}
                onChange={() => toggleType(cat)}
                className="sr-only"
              />
            </label>
          ))}

          {/* Custom types already added */}
          {customTypes.map(ct => (
            <label
              key={ct}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedTypes.has(ct) ? 'bg-blue-100' : 'hover:bg-slate-100'
              }`}
            >
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                selectedTypes.has(ct) ? 'bg-blue-700 border-blue-700' : 'border-slate-300 bg-white'
              }`}>
                {selectedTypes.has(ct) && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </div>
              <span className="text-sm text-slate-700 flex-1">{ct}</span>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); removeCustomType(ct); }}
                className="text-slate-400 hover:text-red-500 text-xs"
              >
                Retirer
              </button>
              <input
                type="checkbox"
                checked={selectedTypes.has(ct)}
                onChange={() => toggleType(ct)}
                className="sr-only"
              />
            </label>
          ))}
        </div>

        {/* Add custom type */}
        <div className="flex gap-2 mt-2">
          <input
            className={inputClass}
            value={customTypeInput}
            onChange={(e) => setCustomTypeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomType(); } }}
            placeholder="Ajouter une intervention personnalisée…"
          />
          <button
            type="button"
            onClick={addCustomType}
            className="px-3 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-200 transition-colors shrink-0"
          >
            + Ajouter
          </button>
        </div>
      </div>

      <Field label="Description des travaux">
        <textarea className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Ex: Remplacement des plaquettes avant" />
      </Field>
      <Field label="Pièces remplacées">
        <input className={inputClass} value={partsReplaced} onChange={(e) => setPartsReplaced(e.target.value)} placeholder="Ex: Plaquettes Brembo, disques ATE" />
      </Field>
      <Field label="Coût des pièces (€)">
        <input className={inputClass} type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
      </Field>
      <Field label="Remarques">
        <textarea className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes facultatives" />
      </Field>

      {/* Schedule next maintenance — only for new records */}
      {!record && (
        <div className="border-t border-slate-100 pt-4 mt-4">
          <label className="flex items-center gap-2.5 cursor-pointer mb-3">
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
              scheduleNext ? 'bg-blue-700 border-blue-700' : 'border-slate-300 bg-white'
            }`}>
              {scheduleNext && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
            </div>
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Programmer le prochain entretien</span>
            </div>
            <input
              type="checkbox"
              checked={scheduleNext}
              onChange={(e) => setScheduleNext(e.target.checked)}
              className="sr-only"
            />
          </label>
          {scheduleNext && (
            <Field label="Prochain entretien à (km)" hint="Le kilométrage doit être supérieur au kilométrage actuel.">
              <input
                className={inputClass}
                type="number"
                value={nextMileage}
                onChange={(e) => setNextMileage(e.target.value)}
                placeholder="Ex: 135000"
              />
            </Field>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </FormSheet>
  );
}
