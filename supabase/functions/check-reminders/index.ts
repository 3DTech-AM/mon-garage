import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

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

function getReminderStatus(
  reminder: Pick<ReminderWithVehicle, 'target_date' | 'target_mileage' | 'alert_days_threshold' | 'alert_km_threshold' | 'completed' | 'active'>,
  currentMileage: number
): 'a_jour' | 'prochainement' | 'a_effectuer' | 'en_retard' {
  if (reminder.completed || !reminder.active) return 'a_jour';

  const now = new Date();
  let dateStatus: 'a_jour' | 'prochainement' | 'a_effectuer' | 'en_retard' | null = null;
  let kmStatus: 'a_jour' | 'prochainement' | 'a_effectuer' | 'en_retard' | null = null;

  if (reminder.target_date) {
    const targetDate = new Date(reminder.target_date + 'T00:00:00');
    const diffDays = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
    const priority = { en_retard: 3, a_effectuer: 2, prochainement: 1, a_jour: 0 };
    return priority[dateStatus] >= priority[kmStatus] ? dateStatus : kmStatus;
  }
  return dateStatus || kmStatus || 'a_jour';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Get VAPID keys
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      return new Response(JSON.stringify({ message: "No active reminders", sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group reminders by user and determine which need notifications
    const userReminders = new Map<string, { reminder: ReminderWithVehicle; status: string }[]>();

    for (const reminder of reminders) {
      const vehicle = reminder.vehicles;
      if (!vehicle) continue;

      const status = getReminderStatus(reminder, vehicle.mileage);

      // Only send notifications for a_effectuer and en_retard
      if (status !== 'a_effectuer' && status !== 'en_retard') continue;

      if (!userReminders.has(reminder.user_id)) {
        userReminders.set(reminder.user_id, []);
      }
      userReminders.get(reminder.user_id)!.push({ reminder, status });
    }

    let totalSent = 0;
    let totalSkipped = 0;

    for (const [userId, items] of userReminders) {
      // Get push subscriptions for this user
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId);

      if (!subscriptions || subscriptions.length === 0) continue;

      for (const { reminder, status } of items) {
        const vehicle = reminder.vehicles!;

        // Check for duplicate notifications — look at log for this reminder in the last 24h
        // For en_retard, only send once every 7 days to avoid spam
        const lookbackHours = status === 'en_retard' ? 168 : 24; // 7 days for overdue, 24h for due
        const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

        const { data: existingLog } = await supabase
          .from("notification_log")
          .select("id")
          .eq("user_id", userId)
          .eq("reminder_id", reminder.id)
          .gte("sent_at", since)
          .limit(1);

        if (existingLog && existingLog.length > 0) {
          totalSkipped++;
          continue;
        }

        // Build notification message
        let body: string;
        if (status === 'en_retard') {
          if (reminder.target_date && reminder.target_mileage != null) {
            body = `${vehicle.brand} ${vehicle.model}: ${reminder.type} en retard (échéance: ${reminder.target_date}, ${reminder.target_mileage} km)`;
          } else if (reminder.target_date) {
            body = `${vehicle.brand} ${vehicle.model}: ${reminder.type} en retard (échéance: ${reminder.target_date})`;
          } else {
            body = `${vehicle.brand} ${vehicle.model}: ${reminder.type} en retard (${reminder.target_mileage} km)`;
          }
        } else {
          if (reminder.target_date && reminder.target_mileage != null) {
            body = `${vehicle.brand} ${vehicle.model}: ${reminder.type} à effectuer bientôt (${reminder.target_date}, ${reminder.target_mileage} km)`;
          } else if (reminder.target_date) {
            body = `${vehicle.brand} ${vehicle.model}: ${reminder.type} à effectuer bientôt (${reminder.target_date})`;
          } else {
            body = `${vehicle.brand} ${vehicle.model}: ${reminder.type} à effectuer (${reminder.target_mileage} km)`;
          }
        }

        // Send to all subscriptions for this user
        let anySuccess = false;
        const expiredEndpoints: string[] = [];

        for (const sub of subscriptions) {
          const result = await sendPushNotification(sub, {
            title: "Mon Garage — Rappel d'entretien",
            body,
            vehicleId: reminder.vehicle_id,
            tag: `reminder-${reminder.id}`,
          }, vapidPublicKey, vapidPrivateKey);

          if (result.success) {
            anySuccess = true;
          } else if (result.error === "subscription_expired") {
            expiredEndpoints.push(sub.endpoint);
          }
        }

        // Clean up expired
        if (expiredEndpoints.length > 0) {
          await supabase.from("push_subscriptions").delete().in("endpoint", expiredEndpoints);
        }

        // Log the notification
        await supabase.from("notification_log").insert({
          user_id: userId,
          reminder_id: reminder.id,
          vehicle_id: reminder.vehicle_id,
          message: body,
          status: anySuccess ? "sent" : "failed",
        });

        if (anySuccess) totalSent++;
      }
    }

    return new Response(JSON.stringify({
      message: "Check complete",
      sent: totalSent,
      skipped: totalSkipped,
      totalReminders: reminders.length,
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

// Inline push sending (same as send-notification function)
async function sendPushNotification(
  subscription: { endpoint: string; p256dh_key: string; auth_key: string },
  payload: { title: string; body: string; vehicleId?: string; tag?: string },
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const message = JSON.stringify(payload);
    const encodedMessage = new TextEncoder().encode(message);

    const localKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );

    const localPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", localKeyPair.publicKey));
    const subscriptionPublicKey = base64UrlToUint8Array(subscription.p256dh_key);
    const subscriptionAuthKey = base64UrlToUint8Array(subscription.auth_key);

    const subscriberEcdhKey = await crypto.subtle.importKey(
      "raw", subscriptionPublicKey,
      { name: "ECDH", namedCurve: "P-256" }, false, []
    );

    const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberEcdhKey },
      localKeyPair.privateKey, 256
    ));

    const ikm = sharedSecret;
    const info = new Uint8Array([
      ...new TextEncoder().encode("WebPush: info\0"),
      ...subscriptionPublicKey,
      ...localPublicKey,
    ]);
    const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
    const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");

    const prkKey = await hkdfExtract(ikm, subscriptionAuthKey);
    const cek = await hkdfExpand(prkKey, cekInfo, 16);
    const nonce = await hkdfExpand(prkKey, nonceInfo, 12);

    const cryptoKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, encodedMessage));

    const header = buildAes128GcmHeader(localPublicKey, encrypted.length + 16);
    const body = new Uint8Array(header.length + encrypted.length);
    body.set(header, 0);
    body.set(encrypted, header.length);

    const jwt = await buildVapidJwt(vapidPublicKey, vapidPrivateKey, new URL(subscription.endpoint).origin);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
        "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
      },
      body,
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 410) {
        return { success: false, error: "subscription_expired" };
      }
      return { success: false, error: `push_failed_${response.status}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hkdfExtract(ikm: Uint8Array, salt: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, salt);
}

async function hkdfExpand(prk: ArrayBuffer, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const blocks: Uint8Array[] = [];
  let prev = new Uint8Array(0);
  let remaining = length;

  for (let counter = 1; remaining > 0; counter++) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev, 0);
    input.set(info, prev.length);
    input[prev.length + info.length] = counter;
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, input));
    const take = Math.min(sig.length, remaining);
    blocks.push(sig.slice(0, take));
    prev = sig;
    remaining -= take;
  }

  const result = new Uint8Array(length);
  let offset = 0;
  for (const block of blocks) { result.set(block, offset); offset += block.length; }
  return result;
}

function buildAes128GcmHeader(localPublicKey: Uint8Array, contentLength: number): Uint8Array {
  const salt = new Uint8Array(16);
  const header = new Uint8Array(21 + localPublicKey.length);
  header.set(salt, 0);
  const dv = new DataView(header.buffer, 16, 5);
  dv.setUint32(0, contentLength, false);
  dv.setUint8(4, localPublicKey.length);
  header.set(localPublicKey, 21);
  return header;
}

async function buildVapidJwt(publicKey: string, privateKey: string, origin: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: origin, exp: now + 12 * 60 * 60, sub: "mailto:mon-garage@example.com" };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  const privateKeyBuffer = base64UrlToUint8Array(privateKey);
  const pkcs8 = new Uint8Array(138);
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
    0x01, 0x01, 0x04, 0x40
  ]);
  pkcs8.set(pkcs8Header, 0);
  pkcs8.set(privateKeyBuffer.slice(0, 32), pkcs8Header.length);
  pkcs8[pkcs8Header.length + 32] = 0x04;
  const publicKeyBuffer = base64UrlToUint8Array(publicKey);
  pkcs8.set(publicKeyBuffer.slice(1, 65), pkcs8Header.length + 33);

  const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned)));
  const rawSig = derToRaw(signature);
  const encodedSig = btoa(String.fromCharCode(...rawSig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${unsigned}.${encodedSig}`;
}

function derToRaw(signature: Uint8Array): Uint8Array {
  const rStart = 4;
  const rLength = signature[rStart - 1];
  const r = signature.slice(rStart, rStart + rLength);
  const sStart = rStart + rLength + 2;
  const sLength = signature[sStart - 1];
  const s = signature.slice(sStart, sStart + sLength);
  const raw = new Uint8Array(64);
  raw.set(r.slice(-32), 32 - Math.min(r.length, 32));
  raw.set(s.slice(-32), 64 - Math.min(s.length, 32));
  return raw;
}
