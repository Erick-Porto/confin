import { useQueryClient } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { lastSyncedAt, useOnline } from '@/lib/offline';

/** Faixa fina no topo quando o aparelho está sem internet. */
export function OfflineBanner() {
  const online = useOnline();
  const queryClient = useQueryClient();
  if (online) return null;
  const at = lastSyncedAt(queryClient);
  return (
    <div
      role="status"
      className="mt-2 flex items-start gap-2 rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <WifiOff size={16} className="mt-px shrink-0" />
      <p>
        Sem internet.{' '}
        {at !== null
          ? `Mostrando os dados salvos às ${format(at, 'HH:mm')} de ${format(at, 'dd/MM')}; lançar e editar volta quando a conexão voltar.`
          : 'Lançar e editar volta quando a conexão voltar.'}
      </p>
    </div>
  );
}
