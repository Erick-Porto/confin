import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ISODate, Transaction, TxStatus, TxType } from '@/types';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Valores iniciais para abrir a folha de novo lançamento já preenchida. */
export interface TransactionDefaults {
  type?: TxType;
  status?: TxStatus;
  amount_cents?: number;
  date?: ISODate;
  description?: string;
  account_id?: string;
  to_account_id?: string;
  category_id?: string;
}

export interface TransactionSheetState {
  open: boolean;
  /** Preenchido = edição deste lançamento. */
  transaction: Transaction | null;
  defaults: TransactionDefaults | null;
}

export interface ToastOptions {
  tone?: 'default' | 'error';
  action?: { label: string; onClick: () => void };
  /** Duração em ms (padrão 4000). */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface UIContextValue {
  hideValues: boolean;
  toggleHideValues(): void;
  theme: ThemePreference;
  setTheme(theme: ThemePreference): void;
  txSheet: TransactionSheetState;
  /** Abre a folha de lançamento: sem argumentos = novo; com transaction = edição. */
  openTransactionSheet(opts?: { transaction?: Transaction; defaults?: TransactionDefaults }): void;
  closeTransactionSheet(): void;
  toast(message: string, opts?: ToastOptions): void;
}

const UIContext = createContext<UIContextValue | null>(null);

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // armazenamento indisponível: preferência vale só nesta sessão
  }
}

function applyTheme(theme: ThemePreference) {
  const dark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B0F0E' : '#0F766E');
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [hideValues, setHideValues] = useState(() => readStorage('confin.hideValues') === '1');
  const [theme, setThemeState] = useState<ThemePreference>(
    () => (readStorage('confin.theme') as ThemePreference | null) ?? 'system',
  );
  const [txSheet, setTxSheet] = useState<TransactionSheetState>({ open: false, transaction: null, defaults: null });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const toggleHideValues = useCallback(() => {
    setHideValues((v) => {
      writeStorage('confin.hideValues', v ? '0' : '1');
      return !v;
    });
  }, []);

  const setTheme = useCallback((t: ThemePreference) => {
    writeStorage('confin.theme', t);
    setThemeState(t);
  }, []);

  const openTransactionSheet = useCallback((opts?: { transaction?: Transaction; defaults?: TransactionDefaults }) => {
    setTxSheet({ open: true, transaction: opts?.transaction ?? null, defaults: opts?.defaults ?? null });
  }, []);

  const closeTransactionSheet = useCallback(() => {
    setTxSheet((s) => ({ ...s, open: false }));
  }, []);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, message, ...opts }]);
      window.setTimeout(() => dismiss(id), opts.duration ?? 4000);
    },
    [dismiss],
  );

  const value = useMemo<UIContextValue>(
    () => ({
      hideValues,
      toggleHideValues,
      theme,
      setTheme,
      txSheet,
      openTransactionSheet,
      closeTransactionSheet,
      toast,
    }),
    [hideValues, toggleHideValues, theme, setTheme, txSheet, openTransactionSheet, closeTransactionSheet, toast],
  );

  return (
    <UIContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm shadow-lg ${
              t.tone === 'error' ? 'bg-expense text-white' : 'bg-fg text-bg'
            }`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="shrink-0 font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </UIContext.Provider>
  );
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI precisa estar dentro de <UIProvider>');
  return ctx;
}
