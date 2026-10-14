import { useEffect, useState } from 'react';
import {
  Bell, BellRing, BellOff, Download, Upload, LogOut, Wifi, WifiOff,
  TestTube, Trash2, AlertCircle, CheckCircle2, Info, FileJson, FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useModal } from '@/context/ModalContext';
import {
  isPushSupported, getNotificationPermissionState,
  subscribeToPush, unsubscribeFromPush, getPushSubscriptions, sendTestNotification,
} from '@/lib/push';
import { exportData, downloadJson, downloadCsv, maintenanceToCsv, importData } from '@/lib/export-import';
import { supabase } from '@/lib/supabase';
import type { PushSubscriptionRow, Vehicle, MaintenanceRecord } from '@/types/database';
import { formatDateTime } from '@/lib/reminder';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const connection = useConnectionStatus();
  const { confirm } = useModal();

  const [pushSupported] = useState(isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionRow[]>([]);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => {
    getNotificationPermissionState().then(setPermission);
    if (pushSupported) loadSubscriptions();
  }, [pushSupported]);

  async function loadSubscriptions() {
    try {
      const subs = await getPushSubscriptions();
      setSubscriptions(subs);
    } catch {
      // ignore
    }
  }

  async function handleEnablePush() {
    setPushLoading(true);
    setPushError(null);
    setPushSuccess(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setPushError('Les notifications ont été refusées. Autorisez-les dans les réglages de votre navigateur.');
        setPushLoading(false);
        return;
      }
      await subscribeToPush();
      await loadSubscriptions();
      setPushSuccess('Notifications activées sur cet appareil.');
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Erreur lors de l\'activation des notifications.');
    }
    setPushLoading(false);
  }

  async function handleDisablePush() {
    setPushLoading(true);
    setPushError(null);
    try {
      await unsubscribeFromPush();
      await loadSubscriptions();
      setPushSuccess('Notifications désactivées sur cet appareil.');
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Erreur lors de la désactivation.');
    }
    setPushLoading(false);
  }

  async function handleTestNotification() {
    setPushLoading(true);
    setPushError(null);
    setPushSuccess(null);
    try {
      const result = await sendTestNotification();
      setPushSuccess(result.message);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi du test.');
    }
    setPushLoading(false);
  }

  async function handleExportJson() {
    try {
      const data = await exportData();
      downloadJson(data, `mon-garage-export-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Erreur lors de l\'export.');
    }
  }

  async function handleExportCsv() {
    try {
      const { data: records } = await supabase.from('maintenance_records').select('*').order('date', { ascending: false });
      const { data: vehicles } = await supabase.from('vehicles').select('*');
      const csv = maintenanceToCsv((records || []) as MaintenanceRecord[], (vehicles || []) as Vehicle[]);
      downloadCsv(csv, `mon-garage-entretiens-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Erreur lors de l\'export CSV.');
    }
  }

  function handleImportClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const counts = await importData(data);
        setImportResult(`Import terminé : ${counts.vehicles} véhicule(s), ${counts.maintenance} entretien(s), ${counts.reminders} rappel(s) importés.`);
      } catch (err) {
        setPushError(err instanceof Error ? err.message : 'Erreur lors de l\'import du fichier.');
      }
    };
    input.click();
  }

  async function handleRemoveSubscription(sub: PushSubscriptionRow) {
    confirm({
      title: 'Supprimer cet appareil',
      message: 'Cet appareil ne recevra plus de notifications push. Vous pourrez le réactiver ultérieurement.',
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        loadSubscriptions();
      },
    });
  }

  const isPushEnabled = subscriptions.length > 0 && permission === 'granted';

  return (
    <div className="px-4 py-5 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-5">Paramètres</h1>

      {/* Connection status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          {connection.online ? (
            <Wifi className="w-5 h-5 text-green-600" />
          ) : (
            <WifiOff className="w-5 h-5 text-red-500" />
          )}
          <div>
            <p className="font-medium text-slate-900">État de la connexion</p>
            <p className="text-sm text-slate-500">
              {connection.online ? 'Connecté à la base de données' : 'Hors ligne — les modifications sont désactivées'}
            </p>
          </div>
        </div>
        {connection.lastSync && (
          <p className="text-xs text-slate-400 ml-8">
            Dernière synchronisation : {formatDateTime(connection.lastSync)}
          </p>
        )}
        {!connection.online && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>Hors connexion : la lecture des données déjà chargées reste possible, mais les opérations d'écriture sont désactivées pour éviter toute perte.</span>
          </div>
        )}
      </div>

      {/* Account */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <h2 className="font-semibold text-slate-900 mb-3">Compte</h2>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-slate-500">Email</p>
            <p className="text-sm font-medium text-slate-900">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => confirm({
            title: 'Se déconnecter',
            message: 'Vous serez déconnecté de cet appareil. Vos données restent sur le serveur.',
            confirmLabel: 'Se déconnecter',
            onConfirm: signOut,
          })}
          className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </button>
      </div>

      {/* Push notifications */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          {isPushEnabled ? (
            <BellRing className="w-5 h-5 text-blue-800" />
          ) : (
            <Bell className="w-5 h-5 text-slate-400" />
          )}
          <h2 className="font-semibold text-slate-900">Notifications push</h2>
        </div>

        {!pushSupported && (
          <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800 mb-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>Les notifications push ne sont pas supportées par ce navigateur. Sur iPhone, installez l'app sur l'écran d'accueil (iOS 16.4 minimum).</span>
          </div>
        )}

        {pushSupported && permission === 'denied' && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>Les notifications sont bloquées. Autorisez-les dans les réglages du navigateur ou de l'app installée.</span>
          </div>
        )}

        {pushError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{pushError}</span>
          </div>
        )}

        {pushSuccess && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 mb-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{pushSuccess}</span>
          </div>
        )}

        {pushSupported && (
          <div className="space-y-2">
            {!isPushEnabled ? (
              <button
                onClick={handleEnablePush}
                disabled={pushLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-800 text-white rounded-xl font-medium text-sm hover:bg-blue-900 disabled:opacity-50 transition-colors"
              >
                <BellRing className="w-4 h-4" />
                Activer les notifications
              </button>
            ) : (
              <button
                onClick={handleDisablePush}
                disabled={pushLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-200 disabled:opacity-50 transition-colors"
              >
                <BellOff className="w-4 h-4" />
                Désactiver sur cet appareil
              </button>
            )}

            {isPushEnabled && (
              <button
                onClick={handleTestNotification}
                disabled={pushLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm hover:border-slate-300 disabled:opacity-50 transition-colors"
              >
                <TestTube className="w-4 h-4" />
                Envoyer une notification de test
              </button>
            )}

            {subscriptions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Appareils enregistrés</p>
                <div className="space-y-2">
                  {subscriptions.map(sub => (
                    <div key={sub.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-600 truncate">{sub.user_agent || 'Appareil inconnu'}</p>
                        <p className="text-xs text-slate-400">Ajouté le {formatDateTime(sub.created_at)}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveSubscription(sub)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 mt-3">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Les notifications kilométriques dépendent de l'actualisation régulière du compteur dans l'app.
                La réception n'est pas garantie si le service backend est suspendu.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Export / Import */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <h2 className="font-semibold text-slate-900 mb-3">Sauvegarde et restauration</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleExportJson}
            className="flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm hover:border-slate-300 transition-colors"
          >
            <FileJson className="w-4 h-4" />
            Export JSON
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm hover:border-slate-300 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export CSV
          </button>
        </div>
        <button
          onClick={handleImportClick}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-medium text-sm hover:border-slate-300 transition-colors mt-2"
        >
          <Upload className="w-4 h-4" />
          Importer une sauvegarde JSON
        </button>
        {importResult && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 mt-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{importResult}</span>
          </div>
        )}
      </div>

      {/* About */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900 mb-2">À propos</h2>
        <p className="text-sm text-slate-500">Mon Garage — v1.0.0</p>
        <p className="text-xs text-slate-400 mt-1">
          Application personnelle de gestion d'entretien de véhicules. PWA installable, notifications push, synchronisation multi-appareils.
        </p>
      </div>
    </div>
  );
}
