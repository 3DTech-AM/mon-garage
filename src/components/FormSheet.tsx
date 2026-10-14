import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface FormSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function FormSheet({ open, title, onClose, children, footer }: FormSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div className="flex-1" />
      <div
        className="bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">
          {children}
        </div>
        {footer && (
          <div className="p-4 border-t border-slate-100 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
}

export function Field({ label, children, hint }: FieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export const inputClass = 'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-transparent transition-all text-base';
