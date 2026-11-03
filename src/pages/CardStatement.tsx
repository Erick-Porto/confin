import { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CreditCard, Receipt } from 'lucide-react';
import { Button, Card, EmptyState, IconButton, Money, PageHeader, SectionTitle, Skeleton } from '@/components/ui';
import { TransactionRow } from '@/components/TransactionRow';
import { useUI } from '@/context/UIContext';
import { useAccounts, useMembers, useTransactions } from '@/hooks/queries';
import { accountLabel, isCreditCard } from '@/lib/accounts';
import {
  currentStatementClosing,
  shiftStatement,
  statementDueDate,
  statementRange,
  statementStatus,
  type StatementStatus,
} from '@/lib/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDate, parseISODate, todayISO } from '@/lib/format';
import { isEffective } from '@/lib/rules';

const STATUS_STYLE: Record<StatementStatus, { label: string; className: string }> = {
  aberta: { label: 'Aberta', className: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300' },
  fechada: { label: 'Fechada', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' },
  paga: { label: 'Paga', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' },
  vencida: { label: 'Vencida', className: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300' },
  'sem-gastos': { label: 'Sem gastos', className: 'bg-surface-2 text-muted' },
};

/** "2026-11-10" -> "10/11". */
function dayMonth(iso: string): string {
  return format(parseISODate(iso), 'dd/MM');
}

export default function CardStatement() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { openTransactionSheet } = useUI();
  const { data: accounts = [], isLoading: loadingAccounts, isError: accountsError } = useAccounts();
  const { data: members = [] } = useMembers();

  const card = accounts.find((a) => a.id === id);
  const validCard = card && isCreditCard(card) ? card : undefined;
  const today = todayISO();

  const closingParam = params.get('fatura');
  const closing = useMemo(() => {
    if (!validCard) return today;
    if (closingParam && /^\d{4}-\d{2}-\d{2}$/.test(closingParam)) return closingParam;
    return currentStatementClosing(validCard, today);
  }, [validCard, closingParam, today]);

  const range = validCard ? statementRange(validCard, closing) : { start: closing, end: closing };
  const dueDate = validCard ? statementDueDate(validCard, closing) : closing;
  const nextClosing = validCard ? shiftStatement(validCard, closing, 1) : closing;

  const txQuery = useTransactions(
    { accountId: validCard?.id, from: range.start, to: nextClosing },
    { enabled: !!validCard },
  );

  const { purchases, payments, totalCents, paidCents } = useMemo(() => {
    const txs = txQuery.data ?? [];
    const cardId = validCard?.id;
    const purchaseList = txs.filter(
      (t) => t.account_id === cardId && t.type !== 'transfer' && t.date >= range.start && t.date <= range.end,
    );
    const paymentList = txs.filter(
      (t) => t.type === 'transfer' && t.to_account_id === cardId && t.date >= closing && t.date < nextClosing,
    );
    let total = 0;
    for (const t of purchaseList) total += t.type === 'expense' ? t.amount_cents : -t.amount_cents;
    const paid = paymentList.filter((t) => isEffective(t, today)).reduce((sum, t) => sum + t.amount_cents, 0);
    return { purchases: purchaseList, payments: paymentList, totalCents: total, paidCents: paid };
  }, [txQuery.data, validCard?.id, range.start, range.end, closing, nextClosing, today]);

  const goTo = (n: number) => {
    if (!validCard) return;
    const next = new URLSearchParams(params);
    next.set('fatura', shiftStatement(validCard, closing, n));
    setParams(next, { replace: true });
  };

  if (loadingAccounts) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (accountsError || !validCard) {
    return (
      <div>
        <PageHeader title="Fatura" back="/contas" />
        <EmptyState
          icon={<CreditCard size={32} />}
          title={accountsError ? 'Não foi possível carregar as contas' : 'Cartão não encontrado'}
          description="Esta tela mostra a fatura de contas do tipo cartão de crédito."
          action={
            <Link to="/contas" className="inline-flex h-11 items-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white dark:bg-brand-600">
              Ir para Contas
            </Link>
          }
        />
      </div>
    );
  }

  const remaining = Math.max(0, totalCents - paidCents);
  const status = statementStatus({ today, closingDate: closing, dueDate, totalCents, paidCents });
  const statusStyle = STATUS_STYLE[status];
  const monthName = format(parseISODate(dueDate), 'MMMM', { locale: ptBR });

  const limit = validCard.credit_limit_cents;
  const available = limit != null ? Math.min(Math.max(validCard.balance_cents + limit, 0), limit) : null;
  const usedRatio = limit ? Math.min(1, Math.max(0, 1 - (available ?? 0) / limit)) : 0;

  const payStatement = () =>
    openTransactionSheet({
      defaults: {
        type: 'transfer',
        to_account_id: validCard.id,
        amount_cents: remaining,
        date: todayISO(),
        description: `Pagamento fatura ${monthName}`,
      },
    });

  return (
    <div className="pb-6">
      <PageHeader title="Fatura" subtitle={accountLabel(validCard, members)} back="/contas" />

      <div className="flex items-center justify-between gap-2">
        <IconButton aria-label="Fatura anterior" onClick={() => goTo(-1)}>
          <ChevronLeft size={22} />
        </IconButton>
        <div className="text-center">
          <div className="text-base font-semibold">Fatura de {monthName}</div>
          <div className="text-xs text-muted">
            Fecha {dayMonth(closing)} · Vence {dayMonth(dueDate)}
          </div>
        </div>
        <IconButton aria-label="Próxima fatura" onClick={() => goTo(1)}>
          <ChevronRight size={22} />
        </IconButton>
      </div>

      <div className="mt-4 rounded-2xl bg-brand-700 p-5 text-white shadow-sm dark:bg-brand-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-white/75">Total da fatura</div>
            <div className="mt-1 text-3xl font-bold">
              {txQuery.isLoading ? <div className="h-9 w-40 animate-pulse rounded-xl bg-white/20" /> : <Money cents={totalCents} />}
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle.className}`}>{statusStyle.label}</span>
        </div>
        <div className="mt-1 text-sm text-white/75">Vencimento em {formatDate(dueDate)}</div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-3 text-sm">
          <div>
            <div className="text-white/75">Pago</div>
            <div className="font-semibold">
              <Money cents={paidCents} />
            </div>
          </div>
          <div>
            <div className="text-white/75">Falta</div>
            <div className="font-semibold">
              <Money cents={remaining} />
            </div>
          </div>
        </div>

        {limit != null && limit > 0 && available != null && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.round(usedRatio * 100)}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-white/75">
              Limite disponível <Money cents={available} /> de <Money cents={limit} />
            </div>
          </div>
        )}
      </div>

      {remaining > 0 && (
        <Button block size="lg" className="mt-4" onClick={payStatement}>
          Pagar fatura
        </Button>
      )}

      {txQuery.isLoading ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : txQuery.isError ? (
        <EmptyState
          title="Não foi possível carregar a fatura"
          action={
            <Button variant="outline" onClick={() => txQuery.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : (
        <>
          <SectionTitle>Compras</SectionTitle>
          {purchases.length === 0 ? (
            <EmptyState icon={<Receipt size={28} />} title="Nenhuma compra nesta fatura" />
          ) : (
            <Card className="p-2">
              {purchases.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} showDate onClick={() => openTransactionSheet({ transaction: tx })} />
              ))}
            </Card>
          )}

          {payments.length > 0 && (
            <>
              <SectionTitle>Pagamentos</SectionTitle>
              <Card className="p-2">
                {payments.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} showDate onClick={() => openTransactionSheet({ transaction: tx })} />
                ))}
              </Card>
            </>
          )}
        </>
      )}

      <div className="mt-6 text-center">
        <button
          type="button"
          className="min-h-11 px-3 text-sm font-medium text-brand-700 dark:text-brand-300"
          onClick={() => navigate(`/extrato?conta=${validCard.id}`)}
        >
          Ver extrato do cartão
        </button>
      </div>
    </div>
  );
}
