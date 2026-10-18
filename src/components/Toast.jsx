/**
 * Toast.jsx — lightweight toast notification system.
 *
 * Mount <ToastProvider> once near the root (inside <DataProvider>), then
 * call `const toast = useToast()` in any page/component:
 *   toast.success('Cleaning applied.')
 *   toast.error('PNG export failed: ...')
 *   toast.info('Nothing to clear.')
 *
 * Toasts auto-dismiss, stack, announce via a single aria-live region, are
 * styled for both themes, and respect prefers-reduced-motion. Messages are
 * rendered as plain text — never pass raw dataset contents.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const AUTO_DISMISS_MS = { success: 4000, info: 4500, error: 7000 };

const TYPE_STYLE = {
  success: {
    Icon: CheckCircle2,
    iconCls: 'text-emerald-600 dark:text-emerald-400',
    barCls: 'bg-emerald-500',
  },
  error: {
    Icon: XCircle,
    iconCls: 'text-red-600 dark:text-red-400',
    barCls: 'bg-red-500',
  },
  info: {
    Icon: Info,
    iconCls: 'text-indigo-600 dark:text-indigo-400',
    barCls: 'bg-indigo-500',
  },
};

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ToastItem({ toast, onDismiss }) {
  const { Icon, iconCls, barCls } = TYPE_STYLE[toast.type] || TYPE_STYLE.info;

  useEffect(() => {
    const t = setTimeout(
      () => onDismiss(toast.id),
      AUTO_DISMISS_MS[toast.type] || AUTO_DISMISS_MS.info,
    );
    return () => clearTimeout(t);
  }, [toast.id, toast.type, onDismiss]);

  return (
    <div
      role="status"
      className="toast-enter pointer-events-auto flex w-full items-start gap-2.5 overflow-hidden rounded-xl border border-slate-200 bg-white py-2.5 pl-1 pr-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
    >
      <span className={`w-1 self-stretch rounded-full ${barCls}`} aria-hidden="true" />
      <Icon size={18} className={`mt-0.5 shrink-0 ${iconCls}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-md p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message) => {
    const text = typeof message === 'string' ? message : String(message ?? '');
    const id = newId();
    setToasts((prev) => [...prev.slice(-4), { id, type, message: text }]);
  }, []);

  const toast = useMemo(
    () => ({
      success: (msg) => push('success', msg),
      error: (msg) => push('error', msg),
      info: (msg) => push('info', msg),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Self-contained entrance animation; disabled under
          prefers-reduced-motion so toasts simply appear. */}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .toast-enter { animation: toast-in 0.22s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .toast-enter { animation: none; }
        }
      `}</style>
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns { success(msg), error(msg), info(msg) }. Must be used under <ToastProvider>. */
export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used within a ToastProvider');
  return toast;
}
