import type { HTMLAttributes, ReactNode } from 'react';

/** Card padrão: fundo surface, cantos de 16 px, borda leve. */
export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-4 shadow-sm shadow-black/[0.03] ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** Título de card com ação opcional à direita (ex.: "Ver tudo"). */
export function CardHeader({ title, action, className = '' }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`mb-3 flex items-center justify-between gap-2 ${className}`}>
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      {action}
    </div>
  );
}

/** Título de seção fora de card. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold text-muted">{children}</h2>
      {action}
    </div>
  );
}
