import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useGroup } from '@/context/GroupContext';
import { getPeriod, shiftPeriod, type Period } from '@/lib/period';
import { IconButton } from '@/components/ui';

/** Dia de início do mês financeiro do grupo ativo (1 a 28). */
export function useMonthStartDay(): number {
  return useGroup().currentGroup?.month_start_day ?? 1;
}

/**
 * Período selecionado, guardado na URL em ?periodo=YYYY-MM-DD (início do período).
 * Sem o parâmetro, é o período atual. Extrato e relatórios usam o mesmo parâmetro.
 */
export function usePeriodParam(): [Period, (p: Period) => void] {
  const startDay = useMonthStartDay();
  const [params, setParams] = useSearchParams();
  const raw = params.get('periodo');
  const period = useMemo(() => getPeriod(raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date(), startDay), [raw, startDay]);
  const setPeriod = useCallback(
    (p: Period) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (p.key === getPeriod(new Date(), startDay).key) next.delete('periodo');
          else next.set('periodo', p.key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams, startDay],
  );
  return [period, setPeriod];
}

/** ‹ novembro de 2026 › */
export function PeriodSwitcher({
  period,
  onChange,
  className = '',
}: {
  period: Period;
  onChange: (p: Period) => void;
  className?: string;
}) {
  const startDay = useMonthStartDay();
  return (
    <div className={`flex items-center justify-between rounded-2xl bg-surface-2 px-1 py-1 ${className}`}>
      <IconButton aria-label="Mês anterior" onClick={() => onChange(shiftPeriod(period, -1, startDay))}>
        <ChevronLeft size={20} />
      </IconButton>
      <span className="text-sm font-semibold capitalize">{period.label}</span>
      <IconButton aria-label="Próximo mês" onClick={() => onChange(shiftPeriod(period, 1, startDay))}>
        <ChevronRight size={20} />
      </IconButton>
    </div>
  );
}
