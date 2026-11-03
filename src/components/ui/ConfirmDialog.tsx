import type { ReactNode } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';

/** Confirmação para ações destrutivas (excluir, sair do grupo). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" block onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} block onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {message && <div className="text-sm text-muted">{message}</div>}
    </Sheet>
  );
}
