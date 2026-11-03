import { useUI } from '@/context/UIContext';
import { formatCents } from '@/lib/format';
import type { TxType } from '@/types';

const HIDDEN = 'R$ ••••';

/**
 * Valor em reais que respeita o "ocultar valores".
 * tone: 'auto' pinta positivo de verde e negativo de vermelho; 'neutral' não pinta.
 */
export function Money({
  cents,
  tone = 'neutral',
  signed = false,
  className = '',
}: {
  cents: number;
  tone?: 'auto' | 'neutral' | 'income' | 'expense' | 'transfer';
  signed?: boolean;
  className?: string;
}) {
  const { hideValues } = useUI();
  const TONES = { neutral: '', income: 'text-income', expense: 'text-expense', transfer: 'text-transfer' } as const;
  const color = tone === 'auto' ? (cents > 0 ? 'text-income' : cents < 0 ? 'text-expense' : '') : TONES[tone];
  return (
    <span className={`tabular whitespace-nowrap ${color} ${className}`}>
      {hideValues ? HIDDEN : formatCents(cents, { signed })}
    </span>
  );
}

/** Valor de um lançamento como aparece em listas: "+R$ 10,00" verde, "-R$ 10,00" vermelho, transferência azul. */
export function TxAmount({ type, cents, className = '' }: { type: TxType; cents: number; className?: string }) {
  const { hideValues } = useUI();
  if (hideValues) return <span className={`tabular ${className}`}>{HIDDEN}</span>;
  if (type === 'income') return <span className={`tabular whitespace-nowrap text-income ${className}`}>+{formatCents(cents)}</span>;
  if (type === 'expense') return <span className={`tabular whitespace-nowrap text-expense ${className}`}>−{formatCents(cents)}</span>;
  return <span className={`tabular whitespace-nowrap text-transfer ${className}`}>{formatCents(cents)}</span>;
}

/** Texto do valor respeitando "ocultar valores" (para gráficos e tooltips). */
export function useMoneyText() {
  const { hideValues } = useUI();
  return (cents: number) => (hideValues ? HIDDEN : formatCents(cents));
}
