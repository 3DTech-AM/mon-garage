import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface ConnectionStatus {
  online: boolean;
  lastSync: string | null;
}

export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>({
    online: navigator.onLine,
    lastSync: null,
  });

  useEffect(() => {
    const handleOnline = () => setStatus(s => ({ ...s, online: true }));
    const handleOffline = () => setStatus(s => ({ ...s, online: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Try a lightweight query to check DB connectivity
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('vehicles').select('id').limit(1);
        if (!error) {
          setStatus(s => ({ ...s, online: navigator.onLine, lastSync: new Date().toISOString() }));
        }
      } catch {
        // offline or unreachable
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return status;
}
