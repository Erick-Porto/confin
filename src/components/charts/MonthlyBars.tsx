import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useUI } from '@/context/UIContext';
import { useMoneyText } from '@/components/ui';
import { formatCentsCompact } from '@/lib/format';

export interface MonthlyBarDatum {
  label: string;
  income: number;
  expense: number;
}

/** Barras agrupadas de entradas x saídas por período. */
export function MonthlyBars({ data, height = 220 }: { data: MonthlyBarDatum[]; height?: number }) {
  const { hideValues } = useUI();
  const money = useMoneyText();
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
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
            cursor={{ fill: 'var(--surface-2)' }}
            formatter={(value, name) => [money(Number(value ?? 0)), name === 'income' ? 'Entradas' : 'Saídas']}
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
          <Bar dataKey="income" name="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expense" name="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
