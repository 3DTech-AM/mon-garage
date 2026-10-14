import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Vehicle, MaintenanceRecord } from '@/types/database';
import { MAINTENANCE_CATEGORIES } from '@/types/database';
import { FormSheet, Field, inputClass } from '@/components/FormSheet';
import { useModal } from '@/context/ModalContext';
import { formatDate, formatMileage, formatCost } from '@/lib/reminder';

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
    const vehicle = vehicleMap.get(record.vehicle_id);
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
            return (
              <div key={record.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md">
                        {record.type}
                      </span>
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
  const [vehicleId, setVehicleId] = useState(record?.vehicle_id || vehicles[0]?.id || '');
  const [date, setDate] = useState(record?.date || new Date().toISOString().slice(0, 10));
  const [mileage, setMileage] = useState(record?.mileage?.toString() || '');
  const [type, setType] = useState(record?.type || MAINTENANCE_CATEGORIES[0]);
  const [customType, setCustomType] = useState('');
  const [description, setDescription] = useState(record?.description || '');
  const [partsReplaced, setPartsReplaced] = useState(record?.parts_replaced || '');
  const [cost, setCost] = useState(record?.cost?.toString() || '');
  const [notes, setNotes] = useState(record?.notes || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCustom = type === '__custom__';
  const finalType = isCustom ? customType.trim() : type;

  const handleSave = async () => {
    setError(null);
    if (!vehicleId) { setError('Sélectionnez un véhicule.'); return; }
    if (isCustom && !customType.trim()) { setError('Saisissez un nom de catégorie.'); return; }

    setSaving(true);
    const payload = {
      vehicle_id: vehicleId,
      date,
      mileage: mileage ? parseInt(mileage) : null,
      type: finalType,
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

    // Update vehicle mileage if a mileage was provided and is higher
    if (payload.mileage != null && payload.mileage > 0) {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      if (vehicle && payload.mileage > vehicle.mileage) {
        await supabase.from('vehicles').update({
          mileage: payload.mileage,
          mileage_updated_at: new Date().toISOString(),
        }).eq('id', vehicleId);
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
      <Field label="Type d'intervention *">
        <select
          className={inputClass}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </FormSheet>
  );
}
