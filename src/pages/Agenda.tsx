import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { addDays } from 'date-fns';
import { CalendarCheck, ChevronRight, CreditCard } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAccounts, useMembers, useTransactions } from '@/hooks/queries';
import { useConfirmTransaction } from '@/features/transactions/mutations';
import { AGENDA_DAYS, buildAgenda } from '@/features/forecast/forecast';
import { TransactionRow } from '@/components/TransactionRow';
import { Button, Card, EmptyState, Money, PageHeader, Skeleton } from '@/components/ui';
import { accountLabel } from '@/lib/accounts';
import { errorMessage } from '@/lib/errors';
import { formatShortDate, parseISODate, todayISO, toISODate } from '@/lib/format';
import type { Transaction } from '@/types';

export default function Agenda() {
  const { openTransactionSheet, toast } = useUI();
  const today = todayISO();
  const from = toISODate(addDays(parseISODate(today), -30));
  const to = toISODate(addDays(parseISODate(today), AGENDA_DAYS));
  const txQ = useTransactions({ from, to });
  const accountsQ = useAccounts();
  const { data: members = [] } = useMembers();
  const confirm = useConfirmTransaction();

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const agenda = useMemo(() => buildAgenda(txQ.data ?? [], accounts, today), [txQ.data, accounts, today]);

  const onConfirm = (tx: Transaction) =>
    confirm.mutate(
      { id: tx.id },
      {
        onSuccess: () => toast('Confirmado'),
        onError: (err) => toast(errorMessage(err), { tone: 'error' }),
      },
    );

  const section = (title: ReactNode, list: Transaction[], danger = false) =>
    list.length > 0 && (
      <Card>
        <h2 className={`mb-2 text-sm font-semibold ${danger ? 'text-expense' : 'text-muted'}`}>{title}</h2>
        <div className="flex flex-col">
          {list.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              showDate
              onClick={() => openTransactionSheet({ transaction: tx })}
              trailingExtra={
                tx.status === 'planned' ? (
                  <button
                    type="button"
                    onClick={() => onConfirm(tx)}
                    disabled={confirm.isPending}
                    className="inline-flex min-h-[40px] items-center rounded-xl bg-brand-700 px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-brand-600"
                  >
                    Confirmar
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
      </Card>
    );

  const empty =
    agenda.overdue.length + agenda.today.length + agenda.week.length + agenda.later.length + agenda.cards.length === 0;
  const error = txQ.isError ? txQ.error : accountsQ.isError ? accountsQ.error : null;

  return (
    <div className="pb-6">
      <PageHeader title="Contas a pagar e receber" back />
      {error ? (
        <Card>
          <EmptyState
            title="Não foi possível carregar"
            description={errorMessage(error)}
            action={
              <Button
                onClick={() => {
                  void txQ.refetch();
                  void accountsQ.refetch();
                }}
              >
                Tentar de novo
              </Button>
            }
          />
        </Card>
      ) : txQ.isLoading || accountsQ.isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted">A pagar</p>
                <Money cents={agenda.toPay} tone="expense" className="text-lg font-semibold" />
              </div>
              <div>
                <p className="text-xs text-muted">A receber</p>
                <Money cents={agenda.toReceive} tone="income" className="text-lg font-semibold" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Próximos {AGENDA_DAYS} dias, mais o que está atrasado.</p>
          </Card>

          {empty ? (
            <Card>
              <EmptyState
                icon={<CalendarCheck size={32} />}
                title="Nada a pagar ou receber"
                description="Previstos, agendados e faturas dos próximos dias aparecem aqui."
              />
            </Card>
          ) : (
            <>
              {section('Atrasados', agenda.overdue, true)}
              {section('Hoje', agenda.today)}
              {section('Próximos 7 dias', agenda.week)}
              {section('Depois', agenda.later)}
              {agenda.cards.length > 0 && (
                <Card>
                  <h2 className="mb-2 text-sm font-semibold text-muted">Faturas de cartão</h2>
                  <div className="flex flex-col">
                    {agenda.cards.map((c) => (
                      <Link
                        key={`${c.account.id}-${c.closingDate}`}
                        to={`/contas/${c.account.id}/fatura?fatura=${c.closingDate}`}
                        className="flex min-h-[56px] items-center gap-3 rounded-xl px-1 hover:bg-surface-2"
                      >
                        <CreditCard size={20} className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{accountLabel(c.account, members)}</span>
                          <span className="block text-xs text-muted">vence {formatShortDate(c.dueDate)}</span>
                        </span>
                        <ChevronRight size={18} className="shrink-0 text-muted" />
                      </Link>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
