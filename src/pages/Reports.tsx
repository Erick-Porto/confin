import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDown } from 'lucide-react';
import { useAccounts, useCategories, useMembers, useTransactions } from '@/hooks/queries';
import { PeriodSwitcher, useMonthStartDay, usePeriodParam } from '@/components/PeriodSwitcher';
import { CategoryDonut } from '@/components/charts/CategoryDonut';
import { MonthlyBars } from '@/components/charts/MonthlyBars';
import { NetWorthCard } from '@/features/investments/NetWorthCard';
import { Card, EmptyState, Money, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatPercent, parseISODate } from '@/lib/format';
import { CategoryIcon } from '@/lib/icons';
import { lastPeriods } from '@/lib/period';
import {
  budgetStatuses,
  expensesByCategory,
  expensesByOwner,
  NO_CATEGORY_ID,
  totalsByPeriod,
  type CategorySlice,
} from '@/features/dashboard/aggregate';
import type { CategoryKind } from '@/types';

type Tab = 'categorias' | 'evolucao' | 'pessoas';

function Bar({ ratio, color, className = 'bg-brand-600' }: { ratio: number; color?: string; className?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-surface-2">
      <div
        className={`h-full rounded-full ${color ? '' : className}`}
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}

function ErrorBox({ error }: { error: unknown }) {
  return (
    <Card>
      <EmptyState title="Não foi possível carregar" description={errorMessage(error)} />
    </Card>
  );
}

function LoadingBlock() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-56" />
      <Skeleton className="h-40" />
    </div>
  );
}

function CategoryRow({
  slice,
  budget,
  kind,
  periodKey,
}: {
  slice: CategorySlice;
  budget: { budget: number; ratio: number } | undefined;
  kind: CategoryKind;
  periodKey: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const go = (id: string) => {
    const base = id === NO_CATEGORY_ID ? '/extrato?' : `/extrato?categoria=${id}&`;
    navigate(`${base}tipo=${kind}&periodo=${periodKey}`);
  };
  return (
    <li className="py-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => go(slice.id)}
          className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-xl px-1 text-left hover:bg-surface-2"
        >
          <CategoryIcon name={slice.icon} color={slice.color} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{slice.name}</span>
              <span className="shrink-0 text-sm font-semibold">
                <Money cents={slice.cents} />
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1">
                <Bar ratio={slice.ratio} color={slice.color} />
              </div>
              <span className="w-10 shrink-0 text-right text-xs text-muted tabular">{formatPercent(slice.ratio)}</span>
            </div>
            {budget && (
              <p className={`mt-1 text-xs ${budget.ratio > 1 ? 'text-expense' : 'text-muted'}`}>
                Orçamento <Money cents={budget.budget} /> · {formatPercent(budget.ratio)}
              </p>
            )}
          </div>
        </button>
        {slice.children.length > 0 && (
          <button
            type="button"
            aria-label={open ? 'Ocultar subcategorias' : 'Mostrar subcategorias'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
          >
            <ChevronDown size={18} className={`transition ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {open && (
        <ul className="ml-12 border-l border-line pl-3">
          {slice.children.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => go(c.id)}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-1 text-left text-sm hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <Money cents={c.cents} className="text-sm" />
                <span className="w-10 shrink-0 text-right text-xs text-muted tabular">{formatPercent(c.ratio)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const startDay = useMonthStartDay();
  const [period, setPeriod] = usePeriodParam();
  const [tab, setTab] = useState<Tab>('categorias');
  const [kind, setKind] = useState<CategoryKind>('expense');

  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: members = [] } = useMembers();

  const periods = useMemo(() => lastPeriods(6, startDay, period.start), [startDay, period.start]);
  const evolution = tab === 'evolucao';
  const txQ = useTransactions(
    evolution ? { from: periods[0].start, to: periods[periods.length - 1].end } : { from: period.start, to: period.end },
  );
  const txs = useMemo(() => txQ.data ?? [], [txQ.data]);

  const slices = useMemo(() => expensesByCategory(txs, categories, kind), [txs, categories, kind]);
  const total = slices.reduce((s, x) => s + x.cents, 0);
  const budgets = useMemo(() => budgetStatuses(txs, categories), [txs, categories]);
  const rows = useMemo(() => totalsByPeriod(txs, periods), [txs, periods]);
  const owners = useMemo(() => expensesByOwner(txs, accounts, members), [txs, accounts, members]);
  const ownersTotal = owners.reduce((s, o) => s + o.cents, 0);

  const openCategory = (id: string) => {
    if (id === NO_CATEGORY_ID || id === 'others') return;
    navigate(`/extrato?categoria=${id}&tipo=${kind}&periodo=${period.key}`);
  };

  return (
    <div className="pb-6">
      <PageHeader title="Relatórios" />
      <div className="flex flex-col gap-4">
        <PeriodSwitcher period={period} onChange={setPeriod} />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'categorias', label: 'Categorias' },
            { value: 'evolucao', label: 'Evolução' },
            { value: 'pessoas', label: 'Pessoas' },
          ]}
        />

        {tab === 'evolucao' && <NetWorthCard />}

        {txQ.isError ? (
          <ErrorBox error={txQ.error} />
        ) : txQ.isLoading ? (
          <LoadingBlock />
        ) : tab === 'categorias' ? (
          <>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'expense', label: 'Saídas' },
                { value: 'income', label: 'Entradas' },
              ]}
            />
            {slices.length === 0 ? (
              <Card>
                <EmptyState title={kind === 'expense' ? 'Sem saídas neste período' : 'Sem entradas neste período'} />
              </Card>
            ) : (
              <>
                <Card>
                  <p className="text-sm text-muted">{kind === 'expense' ? 'Total de saídas' : 'Total de entradas'}</p>
                  <p className="mb-2 text-2xl font-semibold">
                    <Money cents={total} tone={kind === 'expense' ? 'expense' : 'income'} />
                  </p>
                  <CategoryDonut
                    data={slices.map((s) => ({ id: s.id, name: s.name, color: s.color, cents: s.cents }))}
                    total={total}
                    onSelect={openCategory}
                  />
                </Card>
                <Card>
                  <ul className="divide-y divide-line">
                    {slices.map((s) => {
                      const b = kind === 'expense' ? budgets.find((x) => x.category.id === s.id) : undefined;
                      return (
                        <CategoryRow
                          key={s.id}
                          slice={s}
                          kind={kind}
                          periodKey={period.key}
                          budget={b ? { budget: b.budget, ratio: b.ratio } : undefined}
                        />
                      );
                    })}
                  </ul>
                </Card>
              </>
            )}
          </>
        ) : tab === 'evolucao' ? (
          rows.every((r) => r.income === 0 && r.expense === 0) ? (
            <Card>
              <EmptyState title="Sem lançamentos nos últimos 6 períodos" />
            </Card>
          ) : (
            <>
              <Card>
                <div className="mb-2 flex gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-income" /> Entradas
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-expense" /> Saídas
                  </span>
                </div>
                <MonthlyBars
                  data={rows.map((r) => ({
                    label: format(parseISODate(r.period.start), 'MMM', { locale: ptBR }).replace('.', ''),
                    income: r.income,
                    expense: r.expense,
                  }))}
                />
              </Card>
              <Card>
                <ul className="divide-y divide-line">
                  {[...rows].reverse().map((r) => (
                    <li key={r.period.key} className="py-3">
                      <p className="mb-1 text-sm font-semibold capitalize">{r.period.label}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                        <span className="text-muted">Entradas</span>
                        <Money cents={r.income} tone="income" className="text-right" />
                        <span className="text-muted">Saídas</span>
                        <Money cents={r.expense} tone="expense" className="text-right" />
                        <span className="text-muted">Resultado</span>
                        <Money cents={r.net} tone="auto" className="text-right font-semibold" />
                        <span className="text-muted">Taxa de poupança</span>
                        <span className="text-right tabular">{r.savingsRate === null ? '—' : formatPercent(r.savingsRate)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )
        ) : owners.length === 0 ? (
          <Card>
            <EmptyState title="Sem saídas neste período" />
          </Card>
        ) : (
          <Card>
            <ul className="flex flex-col gap-4">
              {owners.map((o) => (
                <li key={o.key}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{o.label}</span>
                    <span className="shrink-0">
                      <Money cents={o.cents} className="font-semibold" />
                      <span className="ml-2 text-xs text-muted">{formatPercent(ownersTotal > 0 ? o.cents / ownersTotal : 0)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Bar ratio={o.ratio} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">Agrupado pelo titular da conta usada.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
