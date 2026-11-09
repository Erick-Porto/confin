import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  useAccountBalancesAt,
  useAccounts,
  useInvestmentFlows,
  useInvestmentValues,
  useInvestments,
} from '@/hooks/queries';
import { useMonthStartDay } from '@/components/PeriodSwitcher';
import { Card, CardHeader, EmptyState, Money, Skeleton, useMoneyText } from '@/components/ui';
import { useUI } from '@/context/UIContext';
import { errorMessage } from '@/lib/errors';
import { formatCentsCompact, formatPercent, parseISODate, todayISO } from '@/lib/format';
import { lastPeriods } from '@/lib/period';
import { netWorthSeries } from './portfolio';

/** Evolução do patrimônio nos últimos 12 períodos financeiros. */
export function NetWorthCard() {
  const startDay = useMonthStartDay();
  const { hideValues } = useUI();
  const money = useMoneyText();
  const accountsQ = useAccounts();
  const invQ = useInvestments();
  const valuesQ = useInvestmentValues();
  const flowsQ = useInvestmentFlows();

  const periods = useMemo(() => lastPeriods(12, startDay), [startDay]);
  const dates = useMemo(() => {
    const today = todayISO();
    return periods.map((p) => (p.end < today ? p.end : today));
  }, [periods]);
  const balancesQ = useAccountBalancesAt(dates);

  const error = accountsQ.error ?? invQ.error ?? valuesQ.error ?? flowsQ.error ?? balancesQ.error;
  const loading = accountsQ.isLoading || invQ.isLoading || valuesQ.isLoading || flowsQ.isLoading || balancesQ.isLoading;

  const series = useMemo(
    () =>
      balancesQ.data
        ? netWorthSeries(dates, balancesQ.data, accountsQ.data ?? [], invQ.data ?? [], valuesQ.data ?? [], flowsQ.data ?? [])
        : [],
    [dates, balancesQ.data, accountsQ.data, invQ.data, valuesQ.data, flowsQ.data],
  );

  const data = series.map((p, i) => ({
    label: format(parseISODate(periods[i].start), 'MMM', { locale: ptBR }).replace('.', ''),
    total: p.total,
  }));
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const change = last && prev ? last.total - prev.total : null;
  const changeRatio = change !== null && prev && prev.total > 0 ? change / prev.total : null;
  const changeTone = (change ?? 0) >= 0 ? 'text-income' : 'text-expense';

  return (
    <Card>
      <CardHeader
        title="Evolução do patrimônio"
        action={
          <Link to="/investimentos" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 dark:text-brand-300">
            Ver carteira
          </Link>
        }
      />
      {error ? (
        <EmptyState title="Não foi possível carregar" description={errorMessage(error)} />
      ) : loading || !last ? (
        <Skeleton className="h-56" />
      ) : (
        <>
          <Money cents={last.total} className="text-2xl font-semibold" />
          <p className="text-xs text-muted">
            {change !== null && (
              <span className={changeTone}>
                <Money cents={change} signed />
                {changeRatio !== null && ` (${formatPercent(changeRatio, 1)})`}
              </span>
            )}{' '}
            vs. período anterior · Em investimentos: <Money cents={last.investments} />
          </p>
          <div className="mt-3 h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
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
                  cursor={{ fill: 'var(--surface-2)' }}
                  formatter={(value) => [money(Number(value ?? 0)), 'Patrimônio']}
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
                <Bar dataKey="total" fill="var(--color-invest)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
