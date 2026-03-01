import { X } from 'lucide-react';
import { useToasts, dismissToast } from '../hooks/useToast';

export function ToastContainer() {
  const toasts = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container no-print">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          <span className="toast-icon">
            {t.type === 'success' && '\u2713'}
            {t.type === 'error' && '!'}
            {t.type === 'info' && '\u2139'}
          </span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-dismiss" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
