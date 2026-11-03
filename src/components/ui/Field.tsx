import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/** Classe base de campos, para quem precisar montar um controle próprio. */
export const inputClass =
  'block w-full h-12 rounded-xl border border-line bg-surface px-3.5 text-base text-fg placeholder:text-muted/70 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:opacity-60';

/**
 * Rótulo + campo + mensagem. Passe o campo como children e use o id recebido:
 * <Field label="Nome">{(id) => <Input id={id} ... />}</Field>
 */
export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-sm text-expense">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputClass} appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10 ${className}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2393a19b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputClass} h-auto min-h-24 py-3 ${className}`} {...rest} />;
}

/** Interruptor liga/desliga. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 py-2 ${disabled ? 'opacity-60' : ''}`}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-brand-700 dark:bg-brand-600' : 'bg-line'}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}
