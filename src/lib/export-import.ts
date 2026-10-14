import { supabase } from './supabase';
import type { Vehicle, MaintenanceRecord, Reminder } from '@/types/database';

interface ExportData {
  exported_at: string;
  version: string;
  vehicles: Vehicle[];
  maintenance_records: MaintenanceRecord[];
  reminders: Reminder[];
}

export async function exportData(): Promise<ExportData> {
  const { data: vehicles, error: e1 } = await supabase.from('vehicles').select('*');
  if (e1) throw e1;

  const { data: maintenance, error: e2 } = await supabase.from('maintenance_records').select('*');
  if (e2) throw e2;

  const { data: reminders, error: e3 } = await supabase.from('reminders').select('*');
  if (e3) throw e3;

  return {
    exported_at: new Date().toISOString(),
    version: '1.0.0',
    vehicles: vehicles || [],
    maintenance_records: maintenance || [],
    reminders: reminders || [],
  };
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function maintenanceToCsv(records: MaintenanceRecord[], vehicles: Vehicle[]): string {
  const vehicleMap = new Map(vehicles.map(v => [v.id, `${v.brand} ${v.model}`]));
  const headers = ['Date', 'Véhicule', 'Kilométrage', 'Type', 'Description', 'Pièces', 'Coût', 'Remarques'];
  const rows = records.map(r => [
    r.date,
    vehicleMap.get(r.vehicle_id) || 'Inconnu',
    r.mileage?.toString() || '',
    r.type,
    r.description || '',
    r.parts_replaced || '',
    r.cost?.toString() || '',
    r.notes || '',
  ].map(field => `"${field.replace(/"/g, '""')}"`).join(','));

  return [headers.join(','), ...rows].join('\n');
}

export async function importData(data: ExportData): Promise<{ vehicles: number; maintenance: number; reminders: number }> {
  if (!data.version || !data.vehicles) {
    throw new Error('Fichier de sauvegarde invalide');
  }

  const counts = { vehicles: 0, maintenance: 0, reminders: 0 };

  // Get existing data for duplicate detection
  const { data: existingVehicles } = await supabase.from('vehicles').select('id');
  const existingVehicleIds = new Set((existingVehicles || []).map(v => v.id));

  // Import vehicles (skip duplicates)
  for (const vehicle of data.vehicles) {
    if (existingVehicleIds.has(vehicle.id)) {
      // Update instead of skip
      const { error } = await supabase.from('vehicles').update({
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        registration: vehicle.registration,
        engine: vehicle.engine,
        mileage: vehicle.mileage,
      }).eq('id', vehicle.id);
      if (!error) counts.vehicles++;
    } else {
      const { error } = await supabase.from('vehicles').insert({
        id: vehicle.id,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        registration: vehicle.registration,
        engine: vehicle.engine,
        mileage: vehicle.mileage,
      });
      if (!error) counts.vehicles++;
    }
  }

  // Get existing maintenance
  const { data: existingMaint } = await supabase.from('maintenance_records').select('id');
  const existingMaintIds = new Set((existingMaint || []).map(m => m.id));

  for (const record of data.maintenance_records || []) {
    if (existingMaintIds.has(record.id)) continue;
    const { error } = await supabase.from('maintenance_records').insert({
      id: record.id,
      vehicle_id: record.vehicle_id,
      date: record.date,
      mileage: record.mileage,
      type: record.type,
      description: record.description,
      parts_replaced: record.parts_replaced,
      cost: record.cost,
      notes: record.notes,
    });
    if (!error) counts.maintenance++;
  }

  // Get existing reminders
  const { data: existingReminders } = await supabase.from('reminders').select('id');
  const existingReminderIds = new Set((existingReminders || []).map(r => r.id));

  for (const reminder of data.reminders || []) {
    if (existingReminderIds.has(reminder.id)) continue;
    const { error } = await supabase.from('reminders').insert({
      id: reminder.id,
      vehicle_id: reminder.vehicle_id,
      type: reminder.type,
      target_mileage: reminder.target_mileage,
      target_date: reminder.target_date,
      alert_km_threshold: reminder.alert_km_threshold,
      alert_days_threshold: reminder.alert_days_threshold,
      active: reminder.active,
      completed: reminder.completed,
      next_interval_km: reminder.next_interval_km,
      next_interval_days: reminder.next_interval_days,
    });
    if (!error) counts.reminders++;
  }

  return counts;
}
