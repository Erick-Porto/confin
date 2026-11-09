import type { Account, Category, Member, Transaction } from '@/types';
import { supabase } from '@/lib/supabase';
import { accountLabel } from '@/lib/accounts';
import { categoryPath } from '@/lib/categories';
import { formatDate, todayISO } from '@/lib/format';
import { isEffective, isPlanned } from '@/lib/rules';

/**
 * Exportação de lançamentos em CSV (Fase 5), no formato que o Excel em português abre direto:
 * separador ";", vírgula decimal, datas dd/mm/aaaa e BOM UTF-8.
 */

const TYPE_LABELS: Record<Transaction['type'], string> = {
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência',
};

function cell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Centavos → "1234,56" (sem separador de milhar, com sinal). */
function amountCell(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

export function transactionsToCsv(
  txs: Transaction[],
  ctx: { accounts: Account[]; categories: Category[]; members: Member[] },
): string {
  const today = todayISO();
  const accountName = (id: string | null) => {
    const acc = id ? ctx.accounts.find((a) => a.id === id) : undefined;
    return acc ? accountLabel(acc, ctx.members) : '';
  };
  const header = ['Data', 'Descrição', 'Tipo', 'Situação', 'Valor', 'Conta', 'Conta de destino', 'Categoria', 'Tags', 'Parcela', 'Observações'];
  const rows = [...txs]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((tx) => {
      const signed = tx.type === 'expense' ? -tx.amount_cents : tx.amount_cents;
      const status = isPlanned(tx) ? 'Previsto' : isEffective(tx, today) ? 'Efetivado' : 'Agendado';
      return [
        formatDate(tx.date),
        tx.description,
        TYPE_LABELS[tx.type],
        status,
        amountCell(signed),
        accountName(tx.account_id),
        accountName(tx.to_account_id),
        tx.type === 'transfer' ? '' : categoryPath(tx.category_id, ctx.categories),
        (tx.tags ?? []).join(', '),
        tx.installment_number && tx.installment_total ? `${tx.installment_number}/${tx.installment_total}` : '',
        tx.notes ?? '',
      ];
    });
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}

/** Baixa o texto como arquivo .csv. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Todos os lançamentos do grupo, em páginas de 1000 (o limite por consulta do Supabase). */
export async function fetchAllTransactions(groupId: string): Promise<Transaction[]> {
  const all: Transaction[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('group_id', groupId)
      .order('date')
      .order('id')
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = (data as Transaction[]).map((t) => ({ ...t, amount_cents: Number(t.amount_cents) }));
    all.push(...rows);
    if (rows.length < page) return all;
  }
}
