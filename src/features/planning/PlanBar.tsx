import type { BlockLevel, BlockStatus } from './plan';

export function levelBarClass(level: BlockLevel): string {
  if (level === 'over') return 'bg-expense';
  if (level === 'warning') return 'bg-amber-500';
  if (level === 'reached') return 'bg-income';
  return 'bg-brand-600';
}

/** Barra de progresso do bloco: parte sólida = feito, parte clara = a caminho. */
export function PlanBar({ status, thin = false }: { status: BlockStatus; thin?: boolean }) {
  const { planned, done, upcoming, level } = status;
  const base = Math.max(planned, done + upcoming, 1);
  const donePct = Math.min(100, (done / base) * 100);
  const upPct = Math.min(100 - donePct, (upcoming / base) * 100);
  const color = levelBarClass(level);
  return (
    <div className={`flex overflow-hidden rounded-full bg-surface-2 ${thin ? 'h-1.5' : 'h-2'}`}>
      <div className={`h-full ${color}`} style={{ width: `${donePct}%` }} />
      <div className={`h-full opacity-40 ${color}`} style={{ width: `${upPct}%` }} />
    </div>
  );
}
