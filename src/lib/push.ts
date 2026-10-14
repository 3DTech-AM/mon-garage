import { supabase } from './supabase';
import type { PushSubscriptionRow } from '@/types/database';

// VAPID public key — must be set as VITE_VAPID_PUBLIC_KEY in .env
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getNotificationPermissionState(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Clé VAPID publique non configurée. Ajoutez VITE_VAPID_PUBLIC_KEY au fichier .env');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  // Save subscription to Supabase
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utilisateur non authentifié');

  const sub = subscription.toJSON();
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error('Subscription invalide');
  }

  // Check if this endpoint already exists
  const { data: existing } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', sub.endpoint)
    .maybeSingle();

  if (existing) {
    // Update last_seen
    await supabase
      .from('push_subscriptions')
      .update({ last_seen_at: new Date().toISOString(), user_agent: navigator.userAgent })
      .eq('id', existing.id);
  } else {
    await supabase.from('push_subscriptions').insert({
      endpoint: sub.endpoint,
      p256dh_key: sub.keys.p256dh,
      auth_key: sub.keys.auth,
      user_agent: navigator.userAgent,
    });
  }

  return subscription;
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
}

export async function getPushSubscriptions(): Promise<PushSubscriptionRow[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function sendTestNotification(): Promise<{ success: boolean; message: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utilisateur non authentifié');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      type: 'test',
      title: 'Mon Garage — Test',
      body: 'Notification de test envoyée avec succès.',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Erreur ${response.status}`);
  }

  const result = await response.json();
  return { success: true, message: result.message || 'Notification de test envoyée' };
}
