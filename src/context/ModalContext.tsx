import { createContext, useContext, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
}

interface ModalContextValue {
  confirm: (options: ModalOptions) => void;
}

const ModalContext = createContext<ModalContextValue | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalOptions | null>(null);

  const confirm = (options: ModalOptions) => setModal(options);

  return (
    <ModalContext.Provider value={{ confirm }}>
      {children}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/40" onClick={() => setModal(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-900">{modal.title}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-slate-600 text-sm mb-6">{modal.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-medium text-sm hover:bg-slate-200 transition-colors"
              >
                {modal.cancelLabel || 'Annuler'}
              </button>
              <button
                onClick={() => {
                  modal.onConfirm();
                  setModal(null);
                }}
                className="flex-1 py-2.5 bg-blue-800 text-white rounded-xl font-medium text-sm hover:bg-blue-900 transition-colors"
              >
                {modal.confirmLabel || 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
