import { useEffect, useState } from 'react';
import { Plus, Car, Pencil, Trash2, TrendingUp, X, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Vehicle } from '@/types/database';
import { FormSheet, Field, inputClass } from '@/components/FormSheet';
import { useModal } from '@/context/ModalContext';
import { formatMileage, formatDate } from '@/lib/reminder';

export default function VehiclesScreen() {
  const { confirm } = useModal();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [showMileageSheet, setShowMileageSheet] = useState<Vehicle | null>(null);

  async function loadVehicles() {
    setLoading(true);
    const { data } = await supabase.from('vehicles').select('*').order('created_at', { ascending: true });
    setVehicles(data || []);
    setLoading(false);
  }

  useEffect(() => { loadVehicles(); }, []);

  async function handleDelete(vehicle: Vehicle) {
    confirm({
      title: 'Supprimer le véhicule',
      message: `Voulez-vous vraiment supprimer ${vehicle.brand} ${vehicle.model} ? Tout l'historique d'entretien et les rappels associés seront également supprimés.`,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        await supabase.from('vehicles').delete().eq('id', vehicle.id);
        loadVehicles();
      },
    });
  }

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Mes véhicules</h1>
        <button
          onClick={() => { setEditingVehicle(null); setShowForm(true); }}
          className="flex items-center gap-1.5 bg-blue-800 text-white px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-blue-900 transition-colors active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <Car className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Aucun véhicule</p>
          <p className="text-sm text-slate-400 mt-1">Ajoutez votre premier véhicule pour commencer</p>
          <button
            onClick={() => { setEditingVehicle(null); setShowForm(true); }}
            className="mt-4 inline-flex items-center gap-1.5 bg-blue-800 text-white px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-blue-900 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter un véhicule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {vehicles.map(vehicle => (
            <div key={vehicle.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                    <Car className="w-6 h-6 text-blue-800" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{vehicle.brand} {vehicle.model}</h3>
                    <p className="text-sm text-slate-500">
                      {vehicle.year || 'Année inconnue'}
                      {vehicle.registration && ` • ${vehicle.registration}`}
                    </p>
                    {vehicle.engine && <p className="text-xs text-slate-400">{vehicle.engine}</p>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { setEditingVehicle(vehicle); setShowForm(true); }}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(vehicle)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-end justify-between bg-slate-50 rounded-xl p-3">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Kilométrage</p>
                  <p className="text-xl font-bold text-slate-900">{formatMileage(vehicle.mileage)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Mis à jour le {formatDate(vehicle.mileage_updated_at)}</p>
                </div>
                <button
                  onClick={() => setShowMileageSheet(vehicle)}
                  className="flex items-center gap-1.5 bg-white text-blue-800 px-3 py-2 rounded-lg font-medium text-sm border border-slate-200 hover:border-blue-300 transition-colors active:scale-[0.98]"
                >
                  <TrendingUp className="w-4 h-4" />
                  Actualiser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <VehicleForm
          vehicle={editingVehicle}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadVehicles(); }}
        />
      )}

      {showMileageSheet && (
        <MileageSheet
          vehicle={showMileageSheet}
          onClose={() => setShowMileageSheet(null)}
          onSaved={() => { setShowMileageSheet(null); loadVehicles(); }}
        />
      )}
    </div>
  );
}

function VehicleForm({ vehicle, onClose, onSaved }: { vehicle: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const [brand, setBrand] = useState(vehicle?.brand || '');
  const [model, setModel] = useState(vehicle?.model || '');
  const [year, setYear] = useState(vehicle?.year?.toString() || '');
  const [registration, setRegistration] = useState(vehicle?.registration || '');
  const [engine, setEngine] = useState(vehicle?.engine || '');
  const [mileage, setMileage] = useState(vehicle?.mileage?.toString() || '0');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    if (!brand.trim() || !model.trim()) {
      setError('La marque et le modèle sont obligatoires.');
      return;
    }
    const mileageNum = parseInt(mileage) || 0;
    if (mileageNum < 0) {
      setError('Le kilométrage ne peut pas être négatif.');
      return;
    }

    setSaving(true);
    const payload = {
      brand: brand.trim(),
      model: model.trim(),
      year: year ? parseInt(year) : null,
      registration: registration.trim() || null,
      engine: engine.trim() || null,
      mileage: mileageNum,
      mileage_updated_at: new Date().toISOString(),
    };

    if (vehicle) {
      const { error } = await supabase.from('vehicles').update(payload).eq('id', vehicle.id);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('vehicles').insert(payload);
      if (error) { setError(error.message); setSaving(false); return; }
    }
    setSaving(false);
    onSaved();
  };

  return (
    <FormSheet
      open
      title={vehicle ? 'Modifier le véhicule' : 'Nouveau véhicule'}
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
      <Field label="Marque *">
        <input className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Renault, Peugeot…" />
      </Field>
      <Field label="Modèle *">
        <input className={inputClass} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Clio, 208…" />
      </Field>
      <Field label="Année de fabrication">
        <input className={inputClass} type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2018" />
      </Field>
      <Field label="Immatriculation">
        <input className={inputClass} value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="AB-123-CD" />
      </Field>
      <Field label="Motorisation">
        <input className={inputClass} value={engine} onChange={(e) => setEngine(e.target.value)} placeholder="1.5 dCi 110ch" />
      </Field>
      <Field label="Kilométrage actuel">
        <input className={inputClass} type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="0" />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </FormSheet>
  );
}

function MileageSheet({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [mileage, setMileage] = useState(vehicle.mileage.toString());
  const [confirmLower, setConfirmLower] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const newMileage = parseInt(mileage) || 0;
  const isLower = newMileage < vehicle.mileage;

  const handleSave = async () => {
    setError(null);
    if (newMileage < 0) {
      setError('Le kilométrage ne peut pas être négatif.');
      return;
    }
    if (isLower && !confirmLower) {
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('vehicles').update({
      mileage: newMileage,
      mileage_updated_at: new Date().toISOString(),
    }).eq('id', vehicle.id);
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
  };

  return (
    <FormSheet
      open
      title="Actualiser le kilométrage"
      onClose={onClose}
      footer={
        <button
          onClick={handleSave}
          disabled={saving || (isLower && !confirmLower)}
          className="w-full py-3 bg-blue-800 text-white rounded-xl font-medium hover:bg-blue-900 disabled:opacity-50 transition-colors active:scale-[0.98]"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      }
    >
      <div className="mb-4 p-3 bg-blue-50 rounded-xl text-sm text-blue-800">
        <p className="font-medium">{vehicle.brand} {vehicle.model}</p>
        <p className="mt-1">Kilométrage actuel : <span className="font-semibold">{formatMileage(vehicle.mileage)}</span></p>
      </div>
      <Field label="Nouveau kilométrage">
        <input className={inputClass} type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="0" autoFocus />
      </Field>

      {isLower && (
        <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl mb-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-orange-800">
              Le nouveau kilométrage ({formatMileage(newMileage)}) est inférieur à l'actuel ({formatMileage(vehicle.mileage)}).
            </p>
            <label className="flex items-center gap-2 mt-2 text-sm text-orange-800">
              <input
                type="checkbox"
                checked={confirmLower}
                onChange={(e) => setConfirmLower(e.target.checked)}
                className="w-4 h-4 rounded border-orange-300"
              />
              Je confirme que cette valeur est correcte
            </label>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </FormSheet>
  );
}
