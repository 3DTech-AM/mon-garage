import type { Reminder, ReminderStatus, Vehicle } from '@/types/database';

/**
 * Calculate the status of a reminder based on current date and mileage.
 * Fuseau horaire: Europe/Zurich
 */
export function getReminderStatus(
  reminder: Pick<Reminder, 'target_date' | 'target_mileage' | 'alert_days_threshold' | 'alert_km_threshold' | 'completed' | 'active'>,
  currentMileage: number
): ReminderStatus {
  if (reminder.completed || !reminder.active) return 'a_jour';

  const now = new Date();
  let dateStatus: ReminderStatus | null = null;
  let kmStatus: ReminderStatus | null = null;

  // Check date-based status
  if (reminder.target_date) {
    const targetDate = new Date(reminder.target_date + 'T00:00:00');
    const diffMs = targetDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      dateStatus = 'en_retard';
    } else if (diffDays <= reminder.alert_days_threshold) {
      dateStatus = 'a_effectuer';
    } else if (diffDays <= reminder.alert_days_threshold + 30) {
      dateStatus = 'prochainement';
    } else {
      dateStatus = 'a_jour';
    }
  }

  // Check mileage-based status
  if (reminder.target_mileage != null) {
    const diffKm = reminder.target_mileage - currentMileage;

    if (diffKm < 0) {
      kmStatus = 'en_retard';
    } else if (diffKm <= reminder.alert_km_threshold) {
      kmStatus = 'a_effectuer';
    } else if (diffKm <= reminder.alert_km_threshold + 5000) {
      kmStatus = 'prochainement';
    } else {
      kmStatus = 'a_jour';
    }
  }

  // If both exist, the worst status wins
  if (dateStatus && kmStatus) {
    const priority: Record<ReminderStatus, number> = {
      en_retard: 3,
      a_effectuer: 2,
      prochainement: 1,
      a_jour: 0,
    };
    return priority[dateStatus] >= priority[kmStatus] ? dateStatus : kmStatus;
  }

  return dateStatus || kmStatus || 'a_jour';
}

export const STATUS_LABELS: Record<ReminderStatus, string> = {
  a_jour: 'À jour',
  prochainement: 'Prochainement',
  a_effectuer: 'À effectuer',
  en_retard: 'En retard',
};

export const STATUS_COLORS: Record<ReminderStatus, string> = {
  a_jour: 'bg-green-100 text-green-800 border-green-300',
  prochainement: 'bg-blue-100 text-blue-800 border-blue-300',
  a_effectuer: 'bg-orange-100 text-orange-800 border-orange-300',
  en_retard: 'bg-red-100 text-red-800 border-red-300',
};

export const STATUS_DOT_COLORS: Record<ReminderStatus, string> = {
  a_jour: 'bg-green-500',
  prochainement: 'bg-blue-500',
  a_effectuer: 'bg-orange-500',
  en_retard: 'bg-red-500',
};

/**
 * Format a date string for display in French
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMileage(km: number | null): string {
  if (km == null) return '—';
  return new Intl.NumberFormat('fr-FR').format(km) + ' km';
}

export function formatCost(cost: number | null): string {
  if (cost == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cost);
}

/**
 * Days until a target date (negative if past)
 */
export function daysUntil(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const target = new Date(targetDate + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Kilometers remaining until target mileage (negative if exceeded)
 */
export function kmUntil(targetMileage: number | null, currentMileage: number): number | null {
  if (targetMileage == null) return null;
  return targetMileage - currentMileage;
}

export function getVehicleLabel(vehicle: Pick<Vehicle, 'brand' | 'model' | 'registration'>): string {
  const parts = [vehicle.brand, vehicle.model];
  if (vehicle.registration) parts.push(`(${vehicle.registration})`);
  return parts.join(' ');
}
