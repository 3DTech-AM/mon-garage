export interface Vehicle {
  id: string;
  user_id: string;
  brand: string;
  model: string;
  year: number | null;
  registration: string | null;
  engine: string | null;
  mileage: number;
  mileage_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceRecord {
  id: string;
  user_id: string;
  vehicle_id: string;
  date: string;
  mileage: number | null;
  type: string;
  description: string | null;
  parts_replaced: string | null;
  cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  vehicle_id: string;
  type: string;
  target_mileage: number | null;
  target_date: string | null;
  alert_km_threshold: number;
  alert_days_threshold: number;
  active: boolean;
  completed: boolean;
  completed_at: string | null;
  next_interval_km: number | null;
  next_interval_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
}

export interface NotificationLogRow {
  id: string;
  user_id: string;
  reminder_id: string | null;
  vehicle_id: string | null;
  message: string;
  status: string;
  sent_at: string;
  error_message: string | null;
}

export type ReminderStatus = 'a_jour' | 'prochainement' | 'a_effectuer' | 'en_retard';

export interface ReminderWithStatus extends Reminder {
  status: ReminderStatus;
  vehicle?: Vehicle;
}

export const MAINTENANCE_CATEGORIES = [
  'Vidange moteur',
  'Filtre à huile',
  'Filtre à air',
  'Filtre habitacle',
  'Filtre carburant',
  'Freins',
  'Pneus',
  'Liquide de refroidissement',
  'Liquide de frein',
  'Courroie de distribution',
  'Batterie',
  'Bougies',
  'Boîte de vitesses',
  'Autre intervention',
] as const;

export const REMINDER_PRESETS_DAYS = [30, 7, 0];
export const REMINDER_PRESET_KM = 1000;
