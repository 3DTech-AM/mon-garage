import { useEffect, useState } from 'react';
import { Home, Car, Wrench, Settings, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ModalProvider } from '@/context/ModalContext';
import AuthScreen from '@/screens/AuthScreen';
import HomeScreen from '@/screens/HomeScreen';
import VehiclesScreen from '@/screens/VehiclesScreen';
import MaintenanceScreen from '@/screens/MaintenanceScreen';
import RemindersScreen from '@/screens/RemindersScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';

type Tab = 'home' | 'vehicles' | 'maintenance' | 'reminders' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Accueil', icon: Home },
  { id: 'vehicles', label: 'Véhicules', icon: Car },
  { id: 'maintenance', label: 'Entretiens', icon: Wrench },
  { id: 'settings', label: 'Paramètres', icon: Settings },
];

function MainApp() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  const connection = useConnectionStatus();

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // ignore registration errors
      });
    }
  }, []);

  // Handle notification click — navigate to vehicle
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data?.vehicleId) {
        setTab('vehicles');
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Offline warning banner */}
      {!connection.online && (
        <div className="bg-orange-500 text-white text-center text-xs font-medium py-2 px-4 shrink-0">
          Mode hors ligne — les modifications sont temporairement désactivées
        </div>
      )}

      {/* Content */}
      <main className="flex-1 pb-20">
        {tab === 'home' && <HomeScreen onNavigate={(t) => setTab(t as Tab)} />}
        {tab === 'vehicles' && <VehiclesScreen />}
        {tab === 'maintenance' && <MaintenanceScreen />}
        {tab === 'reminders' && <RemindersScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 safe-area-pb">
        <div className="max-w-2xl mx-auto flex">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${
                tab === id ? 'text-blue-800' : 'text-slate-400'
              }`}
            >
              <Icon className="w-6 h-6" strokeWidth={tab === id ? 2.5 : 2} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-800 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <ModalProvider>
      <MainApp />
    </ModalProvider>
  );
}
