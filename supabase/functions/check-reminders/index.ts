import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

interface ReminderWithVehicle {
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
  vehicles: { brand: string; model: string; mileage: number } | null;
}

type ReminderStatus = 'a_jour' | 'prochainement' | 'a_effectuer' | 'en_retard';

/**
 * Compute "today at midnight" in Europe/Zurich.
 * The cron runs in UTC, so we need to convert to local time for date comparisons.
 */
function getZurichToday(): Date {
  const now = new Date();
  // Format to Europe/Zurich using Intl, then extract the date parts
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  return new Date(`${year}-${month}-${day}T00:00:00`);
}

function getReminderStatus(
  reminder: Pick<ReminderWithVehicle, 'target_date' | 'target_mileage' | 'alert_days_threshold' | 'alert_km_threshold' | 'completed' | 'active'>,
  currentMileage: number
): ReminderStatus {
  if (reminder.completed || !reminder.active) return 'a_jour';

  const today = getZurichToday();
  let dateStatus: ReminderStatus | null = null;
  let kmStatus: ReminderStatus | null = null;

  if (reminder.target_date) {
    const targetDate = new Date(reminder.target_date + 'T00:00:00');
    const diffMs = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) dateStatus = 'en_retard';
    else if (diffDays <= reminder.alert_days_threshold) dateStatus = 'a_effectuer';
    else if (diffDays <= reminder.alert_days_threshold + 30) dateStatus = 'prochainement';
    else dateStatus = 'a_jour';
  }

  if (reminder.target_mileage != null) {
    const diffKm = reminder.target_mileage - currentMileage;
    if (diffKm < 0) kmStatus = 'en_retard';
    else if (diffKm <= reminder.alert_km_threshold) kmStatus = 'a_effectuer';
    else if (diffKm <= reminder.alert_km_threshold + 5000) kmStatus = 'prochainement';
    else kmStatus = 'a_jour';
  }

  if (dateStatus && kmStatus) {
    const priority: Record<ReminderStatus, number> = { en_retard: 3, a_effectuer: 2, prochainement: 1, a_jour: 0 };
    return priority[dateStatus] >= priority[kmStatus] ? dateStatus : kmStatus;
  }
  return dateStatus || kmStatus || 'a_jour';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Verify CRON_SECRET to prevent unauthorized calls
    const cronSecret = Deno.env.get("CRON_SECRET");
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: "CRON_SECRET non configuré" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Accept secret via header or body
    const headerSecret = req.headers.get("X-Cron-Secret") || "";
    let bodySecret = "";

    try {
      const bodyData = await req.json();
      bodySecret = bodyData?.secret || "";
    } catch {
      // Body may be empty for GET requests
    }

    if (headerSecret !== cronSecret && bodySecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Configure web-push
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:contact@mon-garage.app";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Get all active, non-completed reminders with vehicle info
    const { data: reminders, error: rError } = await supabase
      .from("reminders")
      .select(`
        id, user_id, vehicle_id, type, target_mileage, target_date,
        alert_km_threshold, alert_days_threshold, active, completed,
        vehicles!inner(brand, model, mileage)
      `)
      .eq("active", true)
      .eq("completed", false) as unknown as { data: ReminderWithVehicle[] | null; error: any };

    if (rError) {
      return new Response(JSON.stringify({ error: rError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ message: "Aucun rappel actif", sent: 0, skipped: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group reminders by user, keeping only those that need notifications
    const userReminders = new Map<string, { reminder: ReminderWithVehicle; status: ReminderStatus }[]>();

    for (const reminder of reminders) {
      const vehicle = reminder.vehicles;
      if (!vehicle) continue;

      const status = getReminderStatus(reminder, vehicle.mileage);

      if (status !== 'a_effectuer' && status !== 'en_retard') continue;

      if (!userReminders.has(reminder.user_id)) {
        userReminders.set(reminder.user_id, []);
      }
      userReminders.get(reminder.user_id)!.push({ reminder, status });
    }

    let totalSent = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const [userId, items] of userReminders) {
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId);

      if (!subscriptions || subscriptions.length === 0) continue;

      for (const { reminder, status } of items) {
        const vehicle = reminder.vehicles!;

        // Duplicate prevention: check if a SUCCESSFUL notification was already
        // logged for this reminder within the lookback window.
        // en_retard: 7 days (168h) to avoid excessive daily spam
        // a_effectuer: 24h (once per day is enough)
        const lookbackHours = status === 'en_retard' ? 168 : 24;
        const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

        const { data: existingLog } = await supabase
          .from("notification_log")
          .select("id, status")
          .eq("user_id", userId)
          .eq("reminder_id", reminder.id)
          .eq("status", "sent")
          .gte("sent_at", since)
          .limit(1);

        if (existingLog && existingLog.length > 0) {
          totalSkipped++;
          continue;
        }

        // Build notification message
        let messageBody: string;
        if (status === 'en_retard') {
          if (reminder.target_date && reminder.target_mileage != null) {
            messageBody = `${vehicle.brand} ${vehicle.model}: ${reminder.type} en retard (échéance: ${reminder.target_date}, ${reminder.target_mileage} km)`;
          } else if (reminder.target_date) {
            messageBody = `${vehicle.brand} ${vehicle.model}: ${reminder.type} en retard (échéance: ${reminder.target_date})`;
          } else {
            messageBody = `${vehicle.brand} ${vehicle.model}: ${reminder.type} en retard (${reminder.target_mileage} km)`;
          }
        } else {
          if (reminder.target_date && reminder.target_mileage != null) {
            messageBody = `${vehicle.brand} ${vehicle.model}: ${reminder.type} à effectuer bientôt (${reminder.target_date}, ${reminder.target_mileage} km)`;
          } else if (reminder.target_date) {
            messageBody = `${vehicle.brand} ${vehicle.model}: ${reminder.type} à effectuer bientôt (${reminder.target_date})`;
          } else {
            messageBody = `${vehicle.brand} ${vehicle.model}: ${reminder.type} à effectuer (${reminder.target_mileage} km)`;
          }
        }

        const pushPayload = JSON.stringify({
          title: "Mon Garage — Rappel d'entretien",
          body: messageBody,
          vehicleId: reminder.vehicle_id,
          tag: `reminder-${reminder.id}`,
        });

        // Send to all subscriptions for this user
        let anySuccess = false;
        let lastError: string | null = null;
        const expiredEndpoints: string[] = [];

        for (const sub of subscriptions) {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
          };

          try {
            await webpush.sendNotification(pushSubscription, pushPayload, { TTL: 86400 });
            anySuccess = true;
          } catch (err) {
            lastError = err.message || String(err);
            const statusCode = err.statusCode || 0;
            if (statusCode === 404 || statusCode === 410) {
              expiredEndpoints.push(sub.endpoint);
            }
          }
        }

        // Clean up expired subscriptions
        if (expiredEndpoints.length > 0) {
          await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
        }

        // Log the notification result — only "sent" if at least one push succeeded
        await supabase.from("notification_log").insert({
          user_id: userId,
          reminder_id: reminder.id,
          vehicle_id: reminder.vehicle_id,
          message: messageBody,
          status: anySuccess ? "sent" : "failed",
          error_message: anySuccess ? null : lastError,
        });

        if (anySuccess) {
          totalSent++;
        } else {
          totalFailed++;
        }
      }
    }

    return new Response(JSON.stringify({
      message: "Vérification terminée",
      sent: totalSent,
      skipped: totalSkipped,
      failed: totalFailed,
      totalReminders: reminders.length,
      zurichDate: getZurichToday().toISOString().slice(0, 10),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
