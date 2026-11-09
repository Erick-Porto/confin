import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TriangleAlert } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAccounts, useRecurrences, useTransactions } from '@/hooks/queries';
import { useMonthStartDay } from '@/components/PeriodSwitcher';
import { balanceOn, buildForecast, FORECAST_DAYS, VARIABLE_WINDOW_DAYS, type ForecastSource } from '@/features/forecast/forecast';
import { Button, Card, CardHeader, EmptyState, Money, PageHeader, Skeleton, Switch, useMoneyText } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatCentsCompact, formatShortDate, parseISODate, todayISO, toISODate } from '@/lib/format';
import { getPeriod, shiftPeriod } from '@/lib/period';

const SOURCE_LABELS: Record<ForecastSource, string> = {
  scheduled: 'Agendado',
  planned: 'Previsto',
  recurrence: 'Recorrência',
};

export default function Forecast() {
  const { hideValues } = useUI();
  const money = useMoneyText();
  const startDay = useMonthStartDay();
  const today = todayISO();
  const [includeVariable, setIncludeVariable] = useState(true);

  const accountsQ = useAccounts();
  const recQ = useRecurrences();
  const txQ = useTransactions({
    from: toISODate(addDays(parseISODate(today), -(VARIABLE_WINDOW_DAYS - 1))),
    to: toISODate(addDays(parseISODate(today), FORECAST_DAYS)),
  });

  const ready = !!accountsQ.data && !!recQ.data && !!txQ.data;
  const forecast = useMemo(
    () =>
      ready
        ? buildForecast({
            accounts: accountsQ.data ?? [],
            transactions: txQ.data ?? [],
            recurrences: recQ.data ?? [],
            today,
            includeVariable,
          })
        : null,
    [ready, accountsQ.data, txQ.data, recQ.data, today, includeVariable],
  );

  const periods = useMemo(() => {
    const current = getPeriod(new Date(), startDay);
    return [current, shiftPeriod(current, 1, startDay), shiftPeriod(current, 2, startDay)];
  }, [startDay, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const error = accountsQ.isError ? accountsQ.error : recQ.isError ? recQ.error : txQ.isError ? txQ.error : null;
  const nextItems = useMemo(() => {
    const limit = toISODate(addDays(parseISODate(today), 60));
    return (forecast?.items ?? []).filter((i) => i.date <= limit);
  }, [forecast, today]);

  const stat = (label: string, cents: number, hint?: string) => (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <Money cents={cents} tone={cents < 0 ? 'expense' : 'neutral'} className="mt-0.5 block text-base font-semibold" />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );

  return (
    <div className="pb-6">
      <PageHeader title="Previsão de saldo" back />
      {error ? (
        <Card>
          <EmptyState
            title="Não foi possível carregar"
            description={errorMessage(error)}
            action={
              <Button
                onClick={() => {
                  void accountsQ.refetch();
                  void recQ.refetch();
                  void txQ.refetch();
                }}
              >
                Tentar de novo
              </Button>
            }
          />
        </Card>
      ) : !forecast ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-60" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <Switch
              checked={includeVariable}
              onChange={setIncludeVariable}
              label="Incluir gastos do dia a dia"
              description={
                includeVariable ? (
                  <>
                    média de <Money cents={forecast.dailyVariable} /> por dia
                  </>
                ) : (
                  'Só agendados, previstos e recorrências'
                )
              }
            />
          </Card>

          {forecast.firstNegative && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-2xl border border-expense/40 bg-expense/10 p-3 text-sm font-medium text-expense"
            >
              <TriangleAlert size={18} className="shrink-0" />O saldo fica negativo em{' '}
              {format(parseISODate(forecast.firstNegative.date), 'dd/MM')}
            </div>
          )}

          <Card>
            <CardHeader title="Saldo disponível por dia" />
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecast.points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    tickFormatter={(v) => formatShortDate(String(v))}
                  />
                  <YAxis
                    hide={hideValues}
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    tickFormatter={(v) => formatCentsCompact(Number(v))}
                  />
                  <Tooltip
                    formatter={(value) => [money(Number(value ?? 0)), 'Saldo']}
                    labelFormatter={(l) => formatShortDate(String(l))}
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
                  <ReferenceLine y={0} stroke="var(--color-expense)" strokeDasharray="4 4" />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="var(--color-brand-600)"
                    fill="var(--color-brand-600)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {stat('Hoje', forecast.start)}
            {stat('Fim deste mês', balanceOn(forecast, periods[0].end), periods[0].label)}
            {stat('Fim do próximo mês', balanceOn(forecast, periods[1].end), periods[1].label)}
            {stat('Daqui a 2 meses', balanceOn(forecast, periods[2].end), periods[2].label)}
            {stat('Em 6 meses', forecast.end)}
            {stat('Menor saldo', forecast.lowest.balance, formatShortDate(forecast.lowest.date))}
          </div>

          <Card>
            <CardHeader title="Próximos 60 dias" />
            {nextItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Nada agendado, previsto ou recorrente</p>
            ) : (
              <ul className="divide-y divide-line">
                {nextItems.map((it, i) => (
                  <li key={`${it.date}-${i}`} className="flex min-h-[48px] items-center gap-3 py-2">
                    <span className="w-12 shrink-0 text-xs text-muted">{formatShortDate(it.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{it.description}</span>
                      <span className="block text-xs text-muted">{SOURCE_LABELS[it.source]}</span>
                    </span>
                    <Money
                      cents={it.amount}
                      tone={it.amount < 0 ? 'expense' : 'income'}
                      signed
                      className="shrink-0 text-sm font-semibold"
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="px-1 text-xs text-muted">
            A previsão parte do saldo de hoje e soma lançamentos agendados, previstos, recorrências ativas e, se ligado, a
            média diária dos gastos do dia a dia. Contas de investimento não entram; o cartão pesa como dívida na data da
            compra.
          </p>
        </div>
      )}
    </div>
  );
}
