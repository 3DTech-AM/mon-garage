import { useEffect, useState } from 'react';
import { Car, Wrench, Bell, TrendingUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Vehicle, Reminder } from '@/types/database';
import { getReminderStatus, STATUS_LABELS, STATUS_COLORS, formatDate, formatMileage, daysUntil, kmUntil } from '@/lib/reminder';

interface HomeData {
  vehicles: Vehicle[];
  reminders: Reminder[];
}

export default function HomeScreen({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<HomeData>({ vehicles: [], reminders: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [vRes, rRes] = await Promise.all([
        supabase.from('vehicles').select('*').order('created_at', { ascending: true }),
        supabase.from('reminders').select('*').eq('active', true).eq('completed', false).order('target_date', { ascending: true }),
      ]);
      setData({ vehicles: vRes.data || [], reminders: rRes.data || [] });
      setLoading(false);
    }
    load();
  }, []);

  const vehicleMap = new Map(data.vehicles.map(v => [v.id, v]));

  const activeReminders = data.reminders.map(r => {
    const vehicle = vehicleMap.get(r.vehicle_id);
    return {
      ...r,
      vehicle,
      status: getReminderStatus(r, vehicle?.mileage || 0),
    };
  }).sort((a, b) => {
    const priority: Record<string, number> = { en_retard: 3, a_effectuer: 2, prochainement: 1, a_jour: 0 };
    return (priority[b.status] || 0) - (priority[a.status] || 0);
  });

  const overdueCount = activeReminders.filter(r => r.status === 'en_retard').length;
  const dueCount = activeReminders.filter(r => r.status === 'a_effectuer').length;

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Bonjour</h1>
        <p className="text-sm text-slate-500 mt-0.5">{user?.email}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => onNavigate('vehicles')}
          className="bg-white rounded-2xl p-4 border border-slate-200 text-left hover:shadow-md transition-shadow active:scale-[0.98]"
        >
          <div className="flex items-center justify-between mb-2">
            <Car className="w-6 h-6 text-blue-800" />
            <span className="text-2xl font-bold text-slate-900">{data.vehicles.length}</span>
          </div>
          <p className="text-sm text-slate-500">Véhicule{data.vehicles.length > 1 ? 's' : ''}</p>
        </button>

        <button
          onClick={() => onNavigate('reminders')}
          className="bg-white rounded-2xl p-4 border border-slate-200 text-left hover:shadow-md transition-shadow active:scale-[0.98]"
        >
          <div className="flex items-center justify-between mb-2">
            <Bell className="w-6 h-6 text-blue-800" />
            <span className="text-2xl font-bold text-slate-900">{activeReminders.length}</span>
          </div>
          <p className="text-sm text-slate-500">Rappel{activeReminders.length > 1 ? 's' : ''} actif{activeReminders.length > 1 ? 's' : ''}</p>
        </button>
      </div>

      {/* Alert summary */}
      {(overdueCount > 0 || dueCount > 0) && (
        <div className="mb-6 rounded-2xl p-4 border-2 border-orange-200 bg-orange-50">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-orange-900">Attention</h3>
          </div>
          <p className="text-sm text-orange-800">
            {overdueCount > 0 && <span>{overdueCount} entretien{overdueCount > 1 ? 's' : ''} en retard. </span>}
            {dueCount > 0 && <span>{dueCount} à effectuer bientôt.</span>}
          </p>
        </div>
      )}

      {/* Upcoming reminders */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Échéances à venir</h2>
          <button onClick={() => onNavigate('reminders')} className="text-sm text-blue-700 font-medium">
            Tout voir
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : activeReminders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">Tout est à jour</p>
            <p className="text-sm text-slate-400 mt-1">Aucune échéance en attente</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeReminders.slice(0, 5).map((r) => {
              const vehicle = vehicleMap.get(r.vehicle_id);
              const dLeft = daysUntil(r.target_date);
              const kLeft = kmUntil(r.target_mileage, vehicle?.mileage || 0);
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    r.status === 'en_retard' ? 'bg-red-500' :
                    r.status === 'a_effectuer' ? 'bg-orange-500' :
                    r.status === 'prochainement' ? 'bg-blue-500' : 'bg-green-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{r.type}</p>
                    <p className="text-sm text-slate-500 truncate">
                      {vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Véhicule inconnu'}
                    </p>
                    <div className="flex gap-3 mt-1 text-xs text-slate-400">
                      {dLeft !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {dLeft < 0 ? `En retard de ${Math.abs(dLeft)}j` : dLeft === 0 ? "Aujourd'hui" : `Dans ${dLeft}j`}
                        </span>
                      )}
                      {kLeft !== null && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          {kLeft < 0 ? `Dépassé de ${Math.abs(kLeft)} km` : `${kLeft} km restants`}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Actions rapides</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('vehicles')}
            className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-slate-200 hover:shadow-md transition-shadow active:scale-[0.98]"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-800" />
            </div>
            <span className="text-sm font-medium text-slate-700 text-left">Actualiser km</span>
          </button>
          <button
            onClick={() => onNavigate('maintenance')}
            className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-slate-200 hover:shadow-md transition-shadow active:scale-[0.98]"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-blue-800" />
            </div>
            <span className="text-sm font-medium text-slate-700 text-left">Nouvel entretien</span>
          </button>
        </div>
      </div>
    </div>
  );
}
