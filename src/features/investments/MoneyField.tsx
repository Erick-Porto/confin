import { formatCents } from '@/lib/format';
import { Input } from '@/components/ui';

const MAX_CENTS = 99_999_999_999;

/** Campo de valor compacto: os dígitos entram pela direita como centavos (igual ao AmountInput). */
export function MoneyField({
  id,
  cents,
  onChange,
  placeholder,
}: {
  id?: string;
  cents: number;
  onChange: (cents: number) => void;
  placeholder?: string;
}) {
  const text = cents === 0 && placeholder ? '' : formatCents(cents);
  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className="tabular text-right"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const value = e.target.value;
        if (value.length < text.length) {
          onChange(Math.floor(cents / 10));
          return;
        }
        const digits = value.replace(/\D/g, '');
        onChange(Math.min(digits ? Number(digits) : 0, MAX_CENTS));
      }}
    />
  );
}
