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

// VAPID keys must be set as edge function secrets:
// VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
// Generate with: npx web-push generate-vapid-keys

interface PushPayload {
  type?: string;
  title: string;
  body: string;
  vehicleId?: string;
  tag?: string;
  userId?: string;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh_key: string; auth_key: string },
  payload: PushPayload,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ success: boolean; error?: string }> {
  // Use the Web Push protocol via the built-in crypto APIs
  // We implement a minimal Web Push sender using Web Crypto API

  try {
    const message = JSON.stringify(payload);
    const encodedMessage = new TextEncoder().encode(message);

    // Create the encryption key pair for this message
    const localKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );

    const localPublicKey = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);

    // Import the subscription's p256dh key
    const subscriptionPublicKey = base64UrlToUint8Array(subscription.p256dh_key);
    const subscriptionAuthKey = base64UrlToUint8Array(subscription.auth_key);

    const subscriberEcdhKey = await crypto.subtle.importKey(
      "raw",
      subscriptionPublicKey,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

    // Derive shared secret
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberEcdhKey },
      localKeyPair.privateKey,
      256
    );

    // Derive the content encryption key using HKDF
    const ikm = new Uint8Array(sharedSecret);
    const info = new Uint8Array([
      ...new TextEncoder().encode("WebPush: info\0"),
      ...subscriptionPublicKey,
      ...new Uint8Array(localPublicKey),
    ]);

    const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
    const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");

    const prkKey = await hkdfExtract(ikm, subscriptionAuthKey);
    const cek = await hkdfExpand(prkKey, cekInfo, 16);
    const nonce = await hkdfExpand(prkKey, nonceInfo, 12);

    // Encrypt the message with AES-128-GCM
    const cryptoKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      cryptoKey,
      encodedMessage
    );

    // Build the aes128gcm content coding header
    const header = buildAes128GcmHeader(
      new Uint8Array(localPublicKey),
      encrypted.byteLength + 16
    );

    const body = new Uint8Array(header.length + encrypted.byteLength);
    body.set(header, 0);
    body.set(new Uint8Array(encrypted), header.length);

    // Build VAPID JWT
    const jwt = await buildVapidJwt(
      vapidPublicKey,
      vapidPrivateKey,
      new URL(subscription.endpoint).origin
    );

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
      const status = response.status;
      // 404 or 410 means the subscription is no longer valid
      if (status === 404 || status === 410) {
        return { success: false, error: "subscription_expired" };
      }
      const text = await response.text();
      return { success: false, error: `push_failed_${status}: ${text}` };
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
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function hkdfExtract(ikm: Uint8Array, salt: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, salt);
  return sig;
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
  for (const block of blocks) {
    result.set(block, offset);
    offset += block.length;
  }
  return result;
}

function buildAes128GcmHeader(localPublicKey: Uint8Array, contentLength: number): Uint8Array {
  const salt = new Uint8Array(16); // zero salt
  const header = new Uint8Array(21 + localPublicKey.length);
  header.set(salt, 0);
  const rs = contentLength;
  const dv = new DataView(header.buffer, 16, 5);
  dv.setUint32(0, rs, false);
  dv.setUint8(4, localPublicKey.length);
  header.set(localPublicKey, 21);
  return header;
}

async function buildVapidJwt(publicKey: string, privateKey: string, origin: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: origin,
    exp: now + 12 * 60 * 60,
    sub: "mailto:mon-garage@example.com",
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  // Import the private key
  const privateKeyBuffer = base64UrlToUint8Array(privateKey);

  // PKCS8 format for EC P-256 private key
  const pkcs8 = new Uint8Array(138);
  // PKCS8 header for EC P-256
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
    0x01, 0x01, 0x04, 0x40
  ]);
  pkcs8.set(pkcs8Header, 0);
  pkcs8.set(privateKeyBuffer.slice(0, 32), pkcs8Header.length);
  // Add the public key (0x04 prefix + 64 bytes)
  pkcs8[pkcs8Header.length + 32] = 0x04;
  const publicKeyBuffer = base64UrlToUint8Array(publicKey);
  pkcs8.set(publicKeyBuffer.slice(1, 65), pkcs8Header.length + 33);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );

  // Convert DER signature to raw r||s
  const rawSig = derToRaw(new Uint8Array(signature));
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
  // Pad r and s to 32 bytes each
  raw.set(r.slice(-32), 32 - Math.min(r.length, 32));
  raw.set(s.slice(-32), 64 - Math.min(s.length, 32));
  return raw;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload: PushPayload = await req.json();

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    // Create a client with the user's token to identify them
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: { user } } = await userClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get VAPID keys from environment
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({
        error: "Clés VAPID non configurées. Ajoutez VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY comme secrets de l'Edge Function."
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all push subscriptions for this user
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: "Aucun abonnement push enregistré. Activez les notifications dans l'app."
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let successCount = 0;
    let failureCount = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      const result = await sendWebPush(
        { endpoint: sub.endpoint, p256dh_key: sub.p256dh_key, auth_key: sub.auth_key },
        { ...payload, userId: user.id },
        vapidPublicKey,
        vapidPrivateKey
      );

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        if (result.error === "subscription_expired") {
          expiredEndpoints.push(sub.endpoint);
        }
        // Log the error
        await supabase.from("notification_log").insert({
          user_id: user.id,
          message: payload.body,
          status: "failed",
          error_message: result.error,
        });
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    // Log successful notifications
    if (successCount > 0 && payload.type !== "test") {
      await supabase.from("notification_log").insert({
        user_id: user.id,
        message: payload.body,
        status: "sent",
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Notification envoyée à ${successCount} appareil(s)${failureCount > 0 ? `, ${failureCount} échec(s)` : ""}`,
      successCount,
      failureCount,
      expiredRemoved: expiredEndpoints.length,
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
