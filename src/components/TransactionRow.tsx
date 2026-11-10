import type { ReactNode } from 'react';
import { ArrowLeftRight, Paperclip } from 'lucide-react';
import { useAccounts, useCategories, useMembers } from '@/hooks/queries';
import { accountLabel } from '@/lib/accounts';
import { categoryPath } from '@/lib/categories';
import { formatShortDate, todayISO } from '@/lib/format';
import { CategoryIcon } from '@/lib/icons';
import { isPlanned, isScheduled } from '@/lib/rules';
import { TxAmount } from '@/components/ui';
import type { Transaction } from '@/types';

/** Selo de situação: "Previsto" (precisa confirmar) ou "Agendado" (efetiva sozinho na data). */
export function StatusBadge({ tx }: { tx: Transaction }) {
  if (isPlanned(tx)) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
        Previsto
      </span>
    );
  }
  if (isScheduled(tx, todayISO())) {
    return (
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">
        Agendado
      </span>
    );
  }
  return null;
}

/**
 * Linha padrão de lançamento usada no extrato, no início e na fatura.
 * Mostra ícone da categoria, descrição, categoria · conta, parcela, situação e valor.
 */
export function TransactionRow({
  tx,
  onClick,
  showDate = false,
  trailingExtra,
  attachments = 0,
}: {
  tx: Transaction;
  onClick?: () => void;
  showDate?: boolean;
  /** Algo a mais à direita do valor, fora da área clicável da linha (ex.: botão "Confirmar"). */
  trailingExtra?: ReactNode;
  /** Quantidade de comprovantes; com 1 ou mais mostra o clipe. */
  attachments?: number;
}) {
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: members = [] } = useMembers();

  const category = tx.category_id ? categories.find((c) => c.id === tx.category_id) : undefined;
  const from = accounts.find((a) => a.id === tx.account_id);
  const to = tx.to_account_id ? accounts.find((a) => a.id === tx.to_account_id) : undefined;
  const fromLabel = from ? accountLabel(from, members) : 'Conta';
  const toLabel = to ? accountLabel(to, members) : 'Conta';

  const title =
    tx.description || (tx.type === 'transfer' ? 'Transferência' : category?.name) || 'Sem descrição';
  const subtitleParts =
    tx.type === 'transfer' ? [`${fromLabel} → ${toLabel}`] : [categoryPath(tx.category_id, categories), fromLabel];
  if (tx.installment_number && tx.installment_total) subtitleParts.push(`${tx.installment_number}/${tx.installment_total}`);
  if (showDate) subtitleParts.unshift(formatShortDate(tx.date));

  const content = (
    <>
      {tx.type === 'transfer' ? (
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-transfer/12 text-transfer">
          <ArrowLeftRight size={18} />
        </span>
      ) : (
        <CategoryIcon name={category?.icon} color={category?.color} size={40} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {attachments > 0 && <Paperclip size={13} className="shrink-0 text-muted" aria-label="Com comprovante" role="img" />}
          <StatusBadge tx={tx} />
        </div>
        <div className="truncate text-xs text-muted">{subtitleParts.join(' · ')}</div>
        {tx.tags?.length > 0 && (
          <div className="truncate text-[11px] text-muted">
            {tx.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}
            {tx.tags.length > 3 ? ` +${tx.tags.length - 3}` : ''}
          </div>
        )}
      </div>
      <TxAmount
        type={tx.type}
        cents={tx.amount_cents}
        className={`shrink-0 text-sm font-semibold ${isPlanned(tx) ? 'opacity-70' : ''}`}
      />
    </>
  );

  const base = 'flex min-w-0 flex-1 items-center gap-3 px-1 py-2.5 text-left';
  // O extra fica fora do botão da linha: botão dentro de botão é HTML inválido.
  return (
    <div className="flex w-full items-center gap-2">
      {onClick ? (
        <button type="button" onClick={onClick} className={`${base} rounded-xl transition hover:bg-surface-2`}>
          {content}
        </button>
      ) : (
        <div className={base}>{content}</div>
      )}
      {trailingExtra && <div className="flex shrink-0 items-center">{trailingExtra}</div>}
    </div>
  );
}
