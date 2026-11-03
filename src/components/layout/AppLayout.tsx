import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ChartPie, House, Menu, Plus, ReceiptText } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { Spinner } from '@/components/ui';
import TransactionSheet from '@/features/transactions/TransactionSheet';

const NAV = [
  { to: '/', label: 'Início', icon: House, end: true },
  { to: '/extrato', label: 'Extrato', icon: ReceiptText, end: false },
  null, // botão +
  { to: '/relatorios', label: 'Relatórios', icon: ChartPie, end: false },
  { to: '/mais', label: 'Mais', icon: Menu, end: false },
] as const;

/** Casca das telas logadas: conteúdo centralizado (mobile first) e barra inferior fixa. */
export function AppLayout() {
  const { openTransactionSheet } = useUI();

  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto w-full max-w-lg px-4 pt-safe"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      >
        <Suspense
          fallback={
            <div className="flex justify-center py-20 text-brand-700">
              <Spinner size={28} />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navegação principal"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
          {NAV.map((item) =>
            item === null ? (
              <div key="add" className="flex justify-center">
                <button
                  type="button"
                  onClick={() => openTransactionSheet()}
                  aria-label="Novo lançamento"
                  className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg shadow-brand-700/30 transition active:scale-95 dark:bg-brand-600"
                >
                  <Plus size={28} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 text-[11px] font-medium transition ${
                    isActive ? 'text-brand-700 dark:text-brand-400' : 'text-muted hover:text-fg'
                  }`
                }
              >
                <item.icon size={22} />
                {item.label}
              </NavLink>
            ),
          )}
        </div>
      </nav>

      <TransactionSheet />
    </div>
  );
}
