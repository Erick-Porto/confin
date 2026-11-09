import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, TrendingUp } from 'lucide-react';
import { useAccounts, useInvestmentFlows, useInvestmentValues, useInvestments, useMembers } from '@/hooks/queries';
import { Button, Card, CardHeader, ColorDot, EmptyState, Money, PageHeader, Skeleton } from '@/components/ui';
import { accountLabel } from '@/lib/accounts';
import { errorMessage } from '@/lib/errors';
import { formatPercent, formatShortDate } from '@/lib/format';
import { InvestmentForm } from '@/features/investments/InvestmentForm';
import { UpdateValuesSheet } from '@/features/investments/UpdateValuesSheet';
import {
  INVESTMENT_CLASS_COLORS,
  INVESTMENT_CLASS_LABELS,
  portfolio,
  type Position,
} from '@/features/investments/portfolio';

function profitTone(n: number): string {
  return n >= 0 ? 'text-income' : 'text-expense';
}

export default function Investments() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const accountsQ = useAccounts();
  const membersQ = useMembers();
  const invQ = useInvestments();
  const valuesQ = useInvestmentValues();
  const flowsQ = useInvestmentFlows();

  const [formOpen, setFormOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);
  const loading = accountsQ.isLoading || invQ.isLoading || valuesQ.isLoading || flowsQ.isLoading;
  const error = accountsQ.error ?? invQ.error ?? valuesQ.error ?? flowsQ.error ?? membersQ.error;

  const investAccounts = useMemo(() => accounts.filter((a) => a.type === 'investment' && !a.archived), [accounts]);
  const pf = useMemo(
    () => portfolio(invQ.data ?? [], valuesQ.data ?? [], flowsQ.data ?? [], accounts),
    [invQ.data, valuesQ.data, flowsQ.data, accounts],
  );

  const groups = useMemo(() => {
    const list = pf.positions.filter((p) => showArchived || !p.investment.archived);
    return accounts
      .filter((a) => a.type === 'investment')
      .map((a) => ({ account: a, items: list.filter((p) => p.investment.account_id === a.id) }))
      .filter((g) => g.items.length > 0);
  }, [pf.positions, accounts, showArchived]);
  const archivedCount = pf.positions.filter((p) => p.investment.archived).length;
  const activeCount = pf.positions.length - archivedCount;

  const clearParam = (key: string) => {
    if (!params.has(key)) return;
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next, { replace: true });
  };
  const closeForm = () => {
    setFormOpen(false);
    clearParam('nova');
  };
  const closeUpdate = () => {
    setUpdateOpen(false);
    clearParam('atualizar');
  };

  const wantsNew = params.get('nova') === '1';
  const wantsUpdate = params.get('atualizar') === '1';
  useEffect(() => {
    if (loading || error) return;
    if (wantsNew && investAccounts.length > 0) setFormOpen(true);
    if (wantsUpdate && activeCount > 0) setUpdateOpen(true);
  }, [wantsNew, wantsUpdate, loading, error, investAccounts.length, activeCount]);

  const total = pf.totalValue + pf.cash;

  const renderRow = (p: Position) => (
    <li key={p.investment.id}>
      <button
        type="button"
        onClick={() => navigate(`/investimentos/${p.investment.id}`)}
        className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
      >
        <ColorDot color={INVESTMENT_CLASS_COLORS[p.investment.class]} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {p.investment.name}
            {p.investment.archived && <span className="ml-1 text-xs text-muted">(arquivada)</span>}
          </span>
          <span className="block truncate text-xs text-muted">
            {INVESTMENT_CLASS_LABELS[p.investment.class]} ·{' '}
            {p.fromOpening ? 'Valor de abertura' : `Atualizado em ${formatShortDate(p.valueDate)}`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <Money cents={p.value} className="block text-sm font-semibold" />
          {p.profitRatio !== null && (
            <span className={`block text-xs ${profitTone(p.profit)}`}>
              {p.profit >= 0 ? '+' : ''}
              {formatPercent(p.profitRatio, 1)}
            </span>
          )}
        </span>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </button>
    </li>
  );

  return (
    <div className="pb-6">
      <PageHeader title="Investimentos" back="/mais" />
      <div className="flex flex-col gap-4">
        {error ? (
          <Card>
            <EmptyState title="Não foi possível carregar" description={errorMessage(error)} />
          </Card>
        ) : loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : investAccounts.length === 0 && pf.positions.length === 0 ? (
          <Card>
            <EmptyState
              icon={<TrendingUp size={32} />}
              title="Nenhuma conta de investimento"
              description="Cadastre uma conta do tipo Investimento para acompanhar sua carteira."
              action={<Button onClick={() => navigate('/contas')}>Ir para contas</Button>}
            />
          </Card>
        ) : pf.positions.length === 0 ? (
          <Card>
            <EmptyState
              icon={<TrendingUp size={32} />}
              title="Nenhuma aplicação ainda"
              description="Cadastre suas aplicações para ver valor, lucro e alocação."
              action={<Button onClick={() => setFormOpen(true)}>Nova aplicação</Button>}
            />
          </Card>
        ) : (
          <>
            <Card>
              <p className="text-sm text-muted">Total investido hoje</p>
              <Money cents={total} className="text-3xl font-bold text-invest" />
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Aplicado</dt>
                  <dd className="font-semibold">
                    <Money cents={pf.totalInvested} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Lucro</dt>
                  <dd className={`font-semibold ${profitTone(pf.totalProfit)}`}>
                    <Money cents={pf.totalProfit} signed />
                    {pf.profitRatio !== null && <span className="ml-1 text-xs">({formatPercent(pf.profitRatio, 1)})</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Proventos líquidos</dt>
                  <dd className="font-semibold">
                    <Money cents={pf.totalIncome} />
                  </dd>
                </div>
                {pf.cash > 0 && (
                  <div>
                    <dt className="text-xs text-muted">Dinheiro parado nas contas</dt>
                    <dd className="font-semibold">
                      <Money cents={pf.cash} />
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" onClick={() => setFormOpen(true)} disabled={investAccounts.length === 0}>
                  Nova aplicação
                </Button>
                <Button className="flex-1" variant="secondary" onClick={() => setUpdateOpen(true)} disabled={activeCount === 0}>
                  Atualizar valores
                </Button>
              </div>
            </Card>

            {pf.byClass.length > 0 && (
              <Card>
                <CardHeader title="Alocação por classe" />
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Alocação por classe">
                  {pf.byClass.map((c) => (
                    <div key={c.class} style={{ width: `${c.share * 100}%`, background: INVESTMENT_CLASS_COLORS[c.class] }} />
                  ))}
                </div>
                <ul className="mt-3 flex flex-col">
                  {pf.byClass.map((c) => (
                    <li key={c.class} className="flex min-h-9 items-center gap-2 text-sm">
                      <ColorDot color={INVESTMENT_CLASS_COLORS[c.class]} />
                      <span className="min-w-0 flex-1 truncate">{INVESTMENT_CLASS_LABELS[c.class]}</span>
                      <Money cents={c.value} className="text-muted" />
                      <span className="w-14 text-right font-medium">{formatPercent(c.share, 1)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {groups.map((g) => (
              <Card key={g.account.id}>
                <CardHeader title={accountLabel(g.account, members)} />
                <ul className="divide-y divide-line">{g.items.map(renderRow)}</ul>
              </Card>
            ))}

            {archivedCount > 0 && (
              <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? 'Ocultar arquivadas' : `Mostrar arquivadas (${archivedCount})`}
              </Button>
            )}
          </>
        )}
      </div>

      {formOpen && <InvestmentForm investment={null} onClose={closeForm} />}
      {updateOpen && <UpdateValuesSheet onClose={closeUpdate} />}
    </div>
  );
}
