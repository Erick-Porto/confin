import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp } from 'lucide-react';
import {
  useAccounts,
  useCategories,
  useInvestmentFlows,
  useInvestmentValues,
  useInvestments,
  useMembers,
} from '@/hooks/queries';
import { useUI } from '@/context/UIContext';
import { TransactionRow } from '@/components/TransactionRow';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Money,
  PageHeader,
  Skeleton,
  useMoneyText,
} from '@/components/ui';
import { accountLabel } from '@/lib/accounts';
import { errorMessage } from '@/lib/errors';
import { formatCentsCompact, formatDate, formatPercent, formatShortDate } from '@/lib/format';
import { InvestmentForm } from '@/features/investments/InvestmentForm';
import { UpdateValuesSheet } from '@/features/investments/UpdateValuesSheet';
import { useDeleteInvestment } from '@/features/investments/mutations';
import {
  FLOW_KIND_LABELS,
  INVESTMENT_CLASS_COLORS,
  INVESTMENT_CLASS_LABELS,
  flowKind,
  positionAt,
} from '@/features/investments/portfolio';
import type { InvestmentValue, Transaction } from '@/types';

type HistoryItem =
  | { kind: 'value'; date: string; value: InvestmentValue }
  | { kind: 'flow'; date: string; tx: Transaction };

export default function InvestmentDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { openTransactionSheet, toast, hideValues } = useUI();
  const money = useMoneyText();
  const invQ = useInvestments();
  const valuesQ = useInvestmentValues();
  const flowsQ = useInvestmentFlows();
  const accountsQ = useAccounts();
  const membersQ = useMembers();
  const catsQ = useCategories();
  const remove = useDeleteInvestment();

  const [editOpen, setEditOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [editingValue, setEditingValue] = useState<InvestmentValue | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loading = invQ.isLoading || valuesQ.isLoading || flowsQ.isLoading || accountsQ.isLoading;
  const error = invQ.error ?? valuesQ.error ?? flowsQ.error ?? accountsQ.error;

  const inv = useMemo(() => (invQ.data ?? []).find((i) => i.id === id), [invQ.data, id]);
  const myValues = useMemo(() => (valuesQ.data ?? []).filter((v) => v.investment_id === id), [valuesQ.data, id]);
  const myFlows = useMemo(() => (flowsQ.data ?? []).filter((t) => t.investment_id === id), [flowsQ.data, id]);
  const pos = useMemo(
    () => (inv ? positionAt(inv, valuesQ.data ?? [], flowsQ.data ?? []) : null),
    [inv, valuesQ.data, flowsQ.data],
  );
  const account = (accountsQ.data ?? []).find((a) => a.id === inv?.account_id);

  const chart = useMemo(() => {
    if (!inv) return [];
    const pts = [{ date: inv.opening_date, value: inv.opening_value_cents }];
    for (const v of myValues) if (v.date >= inv.opening_date) pts.push({ date: v.date, value: v.value_cents });
    return pts
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({ label: formatShortDate(p.date), value: p.value }));
  }, [inv, myValues]);

  const history = useMemo<HistoryItem[]>(() => {
    const items: HistoryItem[] = [
      ...myValues.map((value): HistoryItem => ({ kind: 'value', date: value.date, value })),
      ...myFlows.map((tx): HistoryItem => ({ kind: 'flow', date: tx.date, tx })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [myValues, myFlows]);

  const header = <PageHeader title={inv?.name ?? 'Aplicação'} back="/investimentos" />;

  if (error) {
    return (
      <div>
        {header}
        <Card>
          <EmptyState title="Não foi possível carregar" description={errorMessage(error)} />
        </Card>
      </div>
    );
  }
  if (loading) {
    return (
      <div>
        {header}
        <Skeleton className="h-32 w-full" />
        <Skeleton className="mt-4 h-48 w-full" />
      </div>
    );
  }
  if (!inv || !pos) {
    return (
      <div>
        {header}
        <Card>
          <EmptyState
            icon={<TrendingUp size={32} />}
            title="Aplicação não encontrada"
            action={<Button onClick={() => navigate('/investimentos')}>Ver carteira</Button>}
          />
        </Card>
      </div>
    );
  }

  const incomeCategory = (catsQ.data ?? []).find((c) => c.kind === 'income' && !c.archived && c.name === 'Rendimentos');
  const tone = pos.profit >= 0 ? 'text-income' : 'text-expense';

  const aportar = () =>
    openTransactionSheet({
      defaults: { type: 'transfer', to_account_id: inv.account_id, investment_id: inv.id, description: `Aporte ${inv.name}` },
    });
  const resgatar = () =>
    openTransactionSheet({
      defaults: { type: 'transfer', account_id: inv.account_id, investment_id: inv.id, description: `Resgate ${inv.name}` },
    });
  const provento = () =>
    openTransactionSheet({
      defaults: {
        type: 'income',
        account_id: inv.account_id,
        investment_id: inv.id,
        category_id: incomeCategory?.id,
        description: `Provento ${inv.name}`,
      },
    });

  async function doDelete() {
    try {
      await remove.mutateAsync(inv!.id);
      toast('Aplicação excluída');
      navigate('/investimentos', { replace: true });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
      setConfirmDelete(false);
    }
  }

  return (
    <div className="pb-6">
      <PageHeader
        title={inv.name}
        subtitle={`${INVESTMENT_CLASS_LABELS[inv.class]} · ${account ? accountLabel(account, membersQ.data ?? []) : 'Conta'}`}
        back="/investimentos"
        actions={
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            Editar
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: INVESTMENT_CLASS_COLORS[inv.class] }} />
            Valor atual{inv.archived ? ' (arquivada)' : ''}
          </div>
          <Money cents={pos.value} className="text-3xl font-bold text-invest" />
          <p className="text-xs text-muted">
            {pos.fromOpening ? 'Valor de abertura' : `Atualizado em ${formatDate(pos.valueDate)}`}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Aplicado</dt>
              <dd className="font-semibold">
                <Money cents={pos.invested} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Lucro</dt>
              <dd className={`font-semibold ${tone}`}>
                <Money cents={pos.profit} signed />
                {pos.profitRatio !== null && <span className="ml-1 text-xs">({formatPercent(pos.profitRatio, 1)})</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Proventos líquidos</dt>
              <dd className="font-semibold">
                <Money cents={pos.income} />
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setUpdateOpen(true)}>Atualizar valor</Button>
          <Button variant="secondary" onClick={aportar}>
            Aportar
          </Button>
          <Button variant="secondary" onClick={resgatar}>
            Resgatar
          </Button>
          <Button variant="secondary" onClick={provento}>
            Provento
          </Button>
        </div>

        {chart.length > 1 && (
          <Card>
            <CardHeader title="Evolução do valor" />
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <YAxis
                    hide={hideValues}
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    tickFormatter={(v) => formatCentsCompact(Number(v))}
                  />
                  <Tooltip
                    formatter={(value) => [money(Number(value ?? 0)), 'Valor']}
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      color: 'var(--fg)',
                      fontSize: 12,
                    }}
                    itemStyle={{ color: 'var(--fg)' }}
                    labelStyle={{ color: 'var(--muted)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-invest)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Histórico" />
          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              Nenhum valor informado nem lançamento ligado. Use os botões acima.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {history.map((h) =>
                h.kind === 'value' ? (
                  <li key={`v-${h.value.id}`}>
                    <button
                      type="button"
                      onClick={() => setEditingValue(h.value)}
                      className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">Valor informado</span>
                        <span className="block text-xs text-muted">{formatDate(h.date)}</span>
                      </span>
                      <Money cents={h.value.value_cents} className="text-sm font-semibold" />
                    </button>
                  </li>
                ) : (
                  <li key={`t-${h.tx.id}`}>
                    <p className="pt-2 text-xs font-medium text-muted">
                      {(() => {
                        const k = flowKind(h.tx, inv);
                        return k ? FLOW_KIND_LABELS[k] : 'Lançamento';
                      })()}
                    </p>
                    <TransactionRow tx={h.tx} showDate onClick={() => openTransactionSheet({ transaction: h.tx })} />
                  </li>
                ),
              )}
            </ul>
          )}
        </Card>

        <Button variant="outline" onClick={() => setConfirmDelete(true)}>
          Excluir aplicação
        </Button>
      </div>

      {editOpen && <InvestmentForm investment={inv} onClose={() => setEditOpen(false)} />}
      {updateOpen && <UpdateValuesSheet only={[inv.id]} onClose={() => setUpdateOpen(false)} />}
      {editingValue && <UpdateValuesSheet editing={editingValue} onClose={() => setEditingValue(null)} />}
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir aplicação?"
        message="Os lançamentos continuam no extrato, só perdem o vínculo."
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
