import { accountLabel } from '@/lib/accounts';
import { ColorDot } from '@/components/ui';
import type { Account, Member } from '@/types';

/** Fileira rolável de contas para escolher uma. */
export function AccountChips({
  label,
  accounts,
  members,
  value,
  onChange,
  disabledId,
  error,
}: {
  label: string;
  accounts: Account[];
  members: Member[];
  value: string;
  onChange: (id: string) => void;
  /** Conta que não pode ser escolhida (ex.: a de origem ao escolher o destino). */
  disabledId?: string;
  error?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label={label}>
        {accounts.map((a) => {
          const selected = a.id === value;
          const disabled = a.id === disabledId;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(a.id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition disabled:opacity-40 ${
                selected
                  ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-600/30 dark:bg-brand-600/20 dark:text-brand-50'
                  : 'border-line bg-surface text-fg hover:bg-surface-2'
              }`}
            >
              <ColorDot color={a.color} />
              {accountLabel(a, members)}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-sm text-expense">{error}</p>}
    </div>
  );
}
