import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays } from 'date-fns';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useGroup } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { useAccounts, useCategories, useMembers, usePlanBlocks, useTransactions } from '@/hooks/queries';
import { useGoalStatuses } from '@/features/goals/useGoalStatuses';
import { PlanBar } from '@/features/planning/PlanBar';
import { planAlerts, planSummary } from '@/features/planning/plan';
import { useConfirmTransaction } from '@/features/transactions/mutations';
import { useMonthStartDay } from '@/components/PeriodSwitcher';
import { TransactionRow } from '@/components/TransactionRow';
import { NotificationsInvite } from '@/features/notifications/NotificationsInvite';
import { CategoryDonut } from '@/components/charts/CategoryDonut';
import { Button, Card, CardHeader, EmptyState, IconButton, Money, Skeleton } from '@/components/ui';
import { accountLabel, isCreditCard } from '@/lib/accounts';
import { errorMessage } from '@/lib/errors';
import { firstName, formatPercent, todayISO, toISODate } from '@/lib/format';
import { getPeriod } from '@/lib/period';
import { isEffective, isPlanned, sumIncomeExpense } from '@/lib/rules';
import { budgetStatuses, expensesByCategory, NO_CATEGORY_ID, OTHERS_ID, topWithOthers } from '@/features/dashboard/aggregate';
import type { Transaction } from '@/types';

function budgetBarColor(ratio: number): string {
  if (ratio > 1) return 'bg-expense';
  if (ratio >= 0.8) return 'bg-amber-500';
  return 'bg-brand-600';
}

export default function Home() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { currentGroup } = useGroup();
  const { hideValues, toggleHideValues, openTransactionSheet, toast } = useUI();
  const startDay = useMonthStartDay();
  const today = todayISO();
  const period = useMemo(() => getPeriod(new Date(), startDay), [startDay, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountsQ = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: members = [] } = useMembers();
  const periodQ = useTransactions({ from: period.start, to: period.end });
  const pendingQ = useTransactions({ status: 'planned', to: toISODate(addDays(new Date(), 7)) });
  const recentQ = useTransactions({ limit: 10 });
  const confirm = useConfirmTransaction();

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const periodTxs = useMemo(() => periodQ.data ?? [], [periodQ.data]);

  const total = activeAccounts.reduce((s, a) => s + a.balance_cents, 0);
  const forecast = useMemo(() => {
    let delta = 0;
    for (const tx of periodTxs) {
      if (isEffective(tx, today)) continue;
      if (tx.type === 'income') delta += tx.amount_cents;
      else if (tx.type === 'expense') delta -= tx.amount_cents;
    }
    return total + delta;
  }, [periodTxs, total, today]);

  const totals = useMemo(() => sumIncomeExpense(periodTxs, { today }), [periodTxs, today]);
  const slices = useMemo(() => expensesByCategory(periodTxs, categories, 'expense', today), [periodTxs, categories, today]);
  const donut = useMemo(() => topWithOthers(slices, 5), [slices]);
  const totalExpense = slices.reduce((s, x) => s + x.cents, 0);
  const budgets = useMemo(() => budgetStatuses(periodTxs, categories, today), [periodTxs, categories, today]);

  const { statuses: goalStatuses } = useGoalStatuses();
  const homeGoals = useMemo(
    () =>
      goalStatuses
        .filter((s) => !s.goal.archived)
        .sort((a, b) => (a.goal.target_date ?? '9999').localeCompare(b.goal.target_date ?? '9999'))
        .slice(0, 3),
    [goalStatuses],
  );

  const planQ = usePlanBlocks();
  const planBlocks = useMemo(() => planQ.data ?? [], [planQ.data]);
  const hasPlan = planBlocks.length > 0;
  const plan = useMemo(() => planSummary(periodTxs, planBlocks, categories, accounts, today), [periodTxs, planBlocks, categories, accounts, today]);
  const planWarnings = useMemo(() => planAlerts(plan), [plan]);

  const pending = useMemo(
    () =>
      (pendingQ.data ?? [])
        .filter(isPlanned)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5),
    [pendingQ.data],
  );
  const recent = useMemo(() => (recentQ.data ?? []).filter((t) => isEffective(t, today)).slice(0, 5), [recentQ.data, today]);

  const openCategory = (id: string) => {
    if (id === OTHERS_ID || id === NO_CATEGORY_ID) navigate('/extrato?tipo=expense');
    else navigate(`/extrato?categoria=${id}&tipo=expense`);
  };

  const onConfirm = (tx: Transaction) =>
    confirm.mutate(
      { id: tx.id },
      {
        onSuccess: () => toast('Confirmado'),
        onError: (err) => toast(errorMessage(err), { tone: 'error' }),
      },
    );

  const maxBar = Math.max(totals.income, totals.expense, 1);
  const loading = accountsQ.isLoading || periodQ.isLoading;

  return (
    <div className="flex flex-col gap-4 pb-6 pt-2">
      <header className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">Olá, {firstName(profile?.full_name)}</h1>
          <button
            type="button"
            onClick={() => navigate('/mais')}
            className="flex min-h-[44px] max-w-full items-center truncate text-sm text-muted"
          >
            <span className="truncate">{currentGroup?.name}</span>
          </button>
        </div>
        <IconButton
          className="h-11 w-11"
          aria-label={hideValues ? 'Mostrar valores' : 'Ocultar valores'}
          onClick={toggleHideValues}
        >
          {hideValues ? <EyeOff size={22} /> : <Eye size={22} />}
        </IconButton>
      </header>

      {accountsQ.isError ? (
        <Card>
          <EmptyState
            title="Não foi possível carregar"
            description={errorMessage(accountsQ.error)}
            action={<Button onClick={() => accountsQ.refetch()}>Tentar de novo</Button>}
          />
        </Card>
      ) : loading ? (
        <>
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
          <Skeleton className="h-56" />
        </>
      ) : (
        <>
          <section className="rounded-3xl bg-brand-700 p-5 text-white dark:bg-brand-800">
            <p className="text-sm text-white/80">Saldo total</p>
            <p className="mt-1 text-3xl font-semibold">
              <Money cents={total} />
            </p>
            {activeAccounts.length > 0 && (
              <Link to="/previsao" className="mt-1 flex min-h-[44px] items-center text-sm text-white/80">
                Previsto no fim do mês: <Money cents={forecast} className="ml-1 font-semibold text-white" />
              </Link>
            )}
          </section>

          <NotificationsInvite />

          {activeAccounts.length === 0 ? (
            <Card>
              <EmptyState
                title="Bem-vindo ao Confin"
                description="Comece cadastrando suas contas, como Erick - Nubank."
                action={<Button onClick={() => navigate('/contas')}>Cadastrar contas</Button>}
              />
            </Card>
          ) : (
            <>
              <section aria-label="Contas">
                <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Contas</h2>
                <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4">
                  {activeAccounts.map((a) => {
                    const card = isCreditCard(a);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => navigate(card ? `/contas/${a.id}/fatura` : `/extrato?conta=${a.id}`)}
                        className="relative min-h-[72px] w-40 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-surface py-3 pl-5 pr-3 text-left"
                      >
                        <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: a.color }} />
                        <span className="block truncate text-xs text-muted">
                          {card ? 'Fatura · ' : ''}
                          {accountLabel(a, members)}
                        </span>
                        <span className="mt-1 block text-sm font-semibold">
                          <Money cents={a.balance_cents} />
                        </span>
                      </button>
                    );
                  })}
                  <Link
                    to="/contas"
                    className="flex min-h-[72px] w-40 shrink-0 snap-start items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-sm font-medium text-muted"
                  >
                    <Plus size={16} /> Conta
                  </Link>
                </div>
              </section>

              <Card
                role="link"
                tabIndex={0}
                onClick={() => navigate('/relatorios')}
                onKeyDown={(e) => e.key === 'Enter' && navigate('/relatorios')}
                className="cursor-pointer"
              >
                <CardHeader title="Entradas x saídas do mês" />
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-muted">Entradas</span>
                      <Money cents={totals.income} className="font-semibold" />
                    </div>
                    <div className="h-2.5 rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-income" style={{ width: `${(totals.income / maxBar) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-muted">Saídas</span>
                      <Money cents={totals.expense} className="font-semibold" />
                    </div>
                    <div className="h-2.5 rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-expense" style={{ width: `${(totals.expense / maxBar) * 100}%` }} />
                    </div>
                  </div>
                  <p className="text-sm">
                    <span className="text-muted">Resultado: </span>
                    <Money cents={totals.net} tone="auto" className="font-semibold" />
                  </p>
                </div>
              </Card>

              <Card>
                <CardHeader title="Gastos por categoria" />
                {donut.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">Sem gastos neste mês</p>
                ) : (
                  <>
                    <CategoryDonut data={donut} total={totalExpense} onSelect={openCategory} />
                    <ul className="mt-2">
                      {donut.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            onClick={() => openCategory(d.id)}
                            className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-1 text-left hover:bg-surface-2"
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                            <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
                            <span className="text-sm font-semibold tabular">{formatPercent(d.ratio)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>

              {budgets.length > 0 && (
                <Card>
                  <CardHeader title="Orçamentos" />
                  <ul className="flex flex-col gap-4">
                    {budgets.map((b) => (
                      <li key={b.category.id}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{b.category.name}</span>
                          <span className="shrink-0 text-xs text-muted">
                            <Money cents={b.spent} /> de <Money cents={b.budget} />
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 rounded-full bg-surface-2">
                          <div
                            className={`h-full rounded-full ${budgetBarColor(b.ratio)}`}
                            style={{ width: `${Math.min(b.ratio, 1) * 100}%` }}
                          />
                        </div>
                        <p className={`mt-1 text-xs ${b.ratio > 1 ? 'text-expense' : 'text-muted'}`}>
                          {b.ratio > 1 ? (
                            <>
                              Passou <Money cents={b.spent - b.budget} />
                            </>
                          ) : (
                            <>
                              Restam <Money cents={b.budget - b.spent} />
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {!planQ.isLoading && !planQ.isError && (
                !hasPlan ? (
                  <Card className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted">Divida sua renda em blocos, como no 50/30/20</p>
                    <Link to="/planejamento?editar=1" className="flex min-h-11 shrink-0 items-center text-sm font-semibold text-brand-700 dark:text-brand-300">
                      Montar plano
                    </Link>
                  </Card>
                ) : plan.income > 0 ? (
                  <Card>
                    <CardHeader
                      title="Plano do mês"
                      action={
                        <Link to="/planejamento" className="flex min-h-11 items-center text-sm font-semibold text-brand-700 dark:text-brand-300">
                          Ver plano
                        </Link>
                      }
                    />
                    {planWarnings.length > 0 && (
                      <ul className="mb-3 flex flex-col gap-1 text-sm">
                        {planWarnings.map((s) => (
                          <li key={s.block.id} className={s.level === 'over' ? 'text-expense' : 'text-amber-600 dark:text-amber-400'}>
                            {s.level === 'over' ? (
                              <>
                                {s.block.name} passou <Money cents={s.done - s.planned} />
                              </>
                            ) : (
                              `${s.block.name}: ${Math.round(s.ratio * 100)}% do limite`
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <ul className="flex flex-col gap-3">
                      {plan.blocks.map((s) => (
                        <li key={s.block.id}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate font-medium">{s.block.name}</span>
                            <span className="shrink-0 text-xs text-muted">
                              <Money cents={s.done} /> de <Money cents={s.planned} />
                            </span>
                          </div>
                          <div className="mt-1.5">
                            <PlanBar status={s} thin />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null
              )}

              {homeGoals.length > 0 && (
                <Card>
                  <CardHeader
                    title="Metas"
                    action={
                      <Link to="/metas" className="flex min-h-11 items-center text-sm font-semibold text-brand-700 dark:text-brand-300">
                        Ver metas
                      </Link>
                    }
                  />
                  <ul className="flex flex-col gap-3">
                    {homeGoals.map((s) => (
                      <li key={s.goal.id}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{s.goal.name}</span>
                          <span className="shrink-0 text-xs text-muted">
                            <Money cents={s.current} /> de <Money cents={s.goal.target_cents} />
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                          <div className={`h-full ${s.reached ? 'bg-income' : 'bg-brand-600'}`} style={{ width: `${s.ratio * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {pending.length > 0 && (
                <Card>
                  <CardHeader
                    title="Pendentes e próximos"
                    action={
                      <Link to="/agenda" className="flex min-h-[44px] items-center text-sm font-medium text-brand-700 dark:text-brand-400">
                        Ver todos
                      </Link>
                    }
                  />
                  <div className="flex flex-col">
                    {pending.map((tx) => (
                      <div key={tx.id}>
                        <TransactionRow
                          tx={tx}
                          showDate
                          onClick={() => openTransactionSheet({ transaction: tx })}
                          trailingExtra={
                            <span className="flex flex-col items-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => onConfirm(tx)}
                                disabled={confirm.isPending}
                                className="inline-flex min-h-[40px] items-center rounded-xl bg-brand-700 px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-brand-600"
                              >
                                Confirmar
                              </button>
                              {tx.date < today && <span className="text-[10px] font-semibold text-expense">Atrasado</span>}
                            </span>
                          }
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card>
                <CardHeader
                  title="Últimos lançamentos"
                  action={
                    <Link to="/extrato" className="flex min-h-[44px] items-center text-sm font-medium text-brand-700 dark:text-brand-400">
                      Ver extrato
                    </Link>
                  }
                />
                {recentQ.isLoading ? (
                  <Skeleton className="h-40" />
                ) : recent.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted">Nenhum lançamento ainda</p>
                ) : (
                  <div className="flex flex-col">
                    {recent.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} onClick={() => openTransactionSheet({ transaction: tx })} />
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
