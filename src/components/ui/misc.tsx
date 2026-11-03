import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from './Button';

/** Cabeçalho de página com voltar opcional e ações à direita. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** true = volta para a página anterior; string = vai para esta rota. */
  back?: boolean | string;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-2 pb-4 pt-2">
      {back && (
        <IconButton
          aria-label="Voltar"
          className="-ml-2"
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
        >
          <ChevronLeft size={22} />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}

/** Estado vazio com ícone, texto e ação. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Controle segmentado (ex.: Saída | Entrada | Transferência). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex rounded-xl bg-surface-2 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-9 flex-1 rounded-lg px-2 text-sm font-medium transition ${
            o.value === value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Linha de lista tocável (menus, listas de contas/categorias). */
export function ListItem({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  className = '',
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
      </div>
      {trailing}
    </>
  );
  const base = `flex w-full items-center gap-3 px-1 py-3 text-left ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} rounded-xl transition hover:bg-surface-2`}>
      {content}
    </button>
  ) : (
    <div className={base}>{content}</div>
  );
}

/** Bolinha de cor (contas, legendas). */
export function ColorDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: color }} />;
}
