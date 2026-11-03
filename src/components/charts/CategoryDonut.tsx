import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useMoneyText } from '@/components/ui';

export interface DonutItem {
  id: string;
  name: string;
  color: string;
  cents: number;
}

/** Rosca de gastos por categoria. O centro mostra o total. */
export function CategoryDonut({
  data,
  total,
  centerLabel = 'Total',
  onSelect,
  height = 200,
}: {
  data: DonutItem[];
  total: number;
  centerLabel?: string;
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const money = useMoneyText();
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="cents"
            nameKey="name"
            innerRadius="62%"
            outerRadius="95%"
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="var(--surface)"
            strokeWidth={2}
            isAnimationActive={false}
            onClick={(_: unknown, index: number) => {
              const item = data[index];
              if (item && onSelect) onSelect(item.id);
            }}
          >
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => money(Number(value ?? 0))}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              color: 'var(--fg)',
              fontSize: 12,
            }}
            itemStyle={{ color: 'var(--fg)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted">{centerLabel}</span>
        <span className="tabular text-sm font-semibold">{money(total)}</span>
      </div>
    </div>
  );
}
