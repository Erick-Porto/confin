import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';

/**
 * Folha que sobe de baixo no celular e vira um diálogo centralizado em telas largas.
 * Fecha com Esc, com o X ou tocando fora. Use `footer` para os botões fixos no rodapé.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** md = até 480 px; lg = até 640 px em telas largas. */
  size?: 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-xl sm:rounded-3xl ${
          size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton aria-label="Fechar" onClick={onClose} className="-mr-2">
            <X size={20} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div
            className="border-t border-line px-5 pt-3"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
