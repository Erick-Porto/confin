import { forwardRef } from 'react';
import { formatCents } from '@/lib/format';
import type { TxType } from '@/types';

const TONE: Record<TxType, string> = {
  expense: 'text-expense',
  income: 'text-income',
  transfer: 'text-transfer',
};

const MAX_CENTS = 99_999_999_999; // 12 dígitos

/**
 * Valor estilo app de banco: os dígitos entram pela direita como centavos
 * (1, 2, 3, 4 mostra R$ 12,34). Apagar remove o último dígito.
 */
export const AmountInput = forwardRef<
  HTMLInputElement,
  { cents: number; onChange: (cents: number) => void; type: TxType; invalid?: boolean }
>(function AmountInput({ cents, onChange, type, invalid }, ref) {
  const text = formatCents(cents);
  return (
    <div className="py-2">
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label="Valor"
        aria-invalid={invalid || undefined}
        value={text}
        onFocus={(e) => {
          const el = e.currentTarget;
          window.setTimeout(() => el.setSelectionRange(el.value.length, el.value.length), 0);
        }}
        onChange={(e) => {
          const value = e.target.value;
          if (value.length < text.length) {
            onChange(Math.floor(cents / 10));
            return;
          }
          const digits = value.replace(/\D/g, '');
          const next = digits ? Number(digits) : 0;
          onChange(Math.min(next, MAX_CENTS));
        }}
        className={`tabular block w-full bg-transparent text-center text-4xl font-semibold outline-none ${
          cents === 0 ? 'opacity-50' : ''
        } ${TONE[type]}`}
      />
    </div>
  );
});
