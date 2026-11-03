export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Carregando a tela inteira (sessão, grupo). */
export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-brand-700">
      <Spinner size={32} />
    </div>
  );
}

/** Bloco cinza animado para esqueleto de carregamento. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}
