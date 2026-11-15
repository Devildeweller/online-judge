import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';

type Tone = 'info' | 'ok' | 'error';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  show: (message: string, tone?: Tone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: Tone = 'info') => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-3), { id, tone, message }]);
    window.setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  const value = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, 'ok'), error: (m) => show(m, 'error') }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}
