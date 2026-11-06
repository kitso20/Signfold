import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastsProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          <span className="toast-icon">
            {toast.tone === 'success' ? (
              <CheckCircle2 size={17} />
            ) : toast.tone === 'error' ? (
              <AlertCircle size={17} />
            ) : (
              <Info size={17} />
            )}
          </span>
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
