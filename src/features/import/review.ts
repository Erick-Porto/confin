import { differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { parseISODate } from '@/lib/format';
import type { Account, Category, Transaction, TransactionInput } from '@/types';
import type { ImportRow } from './parse';

/**
 * Revisão da importação (Fase 8).
 *
 * - Tipo pelo sinal (com "Inverter sinais" para faturas que usam o sinal ao contrário).
 * - "imported": a conta já tem um lançamento com o mesmo import_id → fica de fora.
 * - "duplicate": já existe na conta um lançamento lançado à mão com o mesmo tipo e valor, até 3 dias de
 *   diferença → fica desmarcado (provavelmente é o mesmo).
 * - "card-payment": entrada numa conta de cartão de crédito = pagamento da fatura; deve ser lançado como
 *   transferência a partir da conta que pagou → fica desmarcado.
 * - Categoria sugerida pelo histórico do grupo: mesma descrição (sem números e acentos) ou mesmas duas
 *   primeiras palavras, do lançamento mais recente com categoria do mesmo tipo.
 */

export type ReviewStatus = 'new' | 'imported' | 'duplicate' | 'card-payment';

export interface ReviewRow extends ImportRow {
  /** Chave estável da linha na tela (= importId). */
  key: string;
  type: 'income' | 'expense';
  /** Valor sem sinal, em centavos. */
  amount: number;
  status: ReviewStatus;
  include: boolean;
  categoryId: string | null;
  /** Lançamento existente parecido (status "duplicate"). */
  match: Transaction | null;
}

export const DUPLICATE_WINDOW_DAYS = 3;

export function normalizeDescription(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[0-9]/g, ' ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstWords(s: string): string {
  return s.split(' ').slice(0, 2).join(' ');
}

/** Categoria sugerida pelo histórico (lançamentos mais recentes primeiro), ou null. */
export function suggestCategory(
  description: string,
  type: 'income' | 'expense',
  history: Transaction[],
  categories: Category[],
): string | null {
  const target = normalizeDescription(description);
  if (!target) return null;
  const valid = new Set(categories.filter((c) => c.kind === type && !c.archived).map((c) => c.id));
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const candidates = sorted.filter((t) => t.type === type && t.category_id && valid.has(t.category_id));
  const exact = candidates.find((t) => normalizeDescription(t.description) === target);
  if (exact) return exact.category_id;
  const prefix = firstWords(target);
  if (prefix.length < 4) return null;
  const partial = candidates.find((t) => firstWords(normalizeDescription(t.description)) === prefix);
  return partial?.category_id ?? null;
}

/**
 * Monta as linhas da revisão.
 * @param existing lançamentos da conta de destino entre a menor data − 3 dias e a maior + 3 dias
 * @param history lançamentos recentes do grupo (para sugerir categoria)
 */
export function buildReview(
  rows: ImportRow[],
  opts: { account: Account; invert: boolean; existing: Transaction[]; history: Transaction[]; categories: Category[] },
): ReviewRow[] {
  const importedIds = new Set(opts.existing.map((t) => t.import_id).filter((x): x is string => !!x));
  const manual = opts.existing.filter((t) => !t.import_id && t.account_id === opts.account.id && t.type !== 'transfer');
  const used = new Set<string>();
  const isCard = opts.account.type === 'credit_card';

  return rows.map((row) => {
    const signed = opts.invert ? -row.amount_cents : row.amount_cents;
    const type: 'income' | 'expense' = signed > 0 ? 'income' : 'expense';
    const amount = Math.abs(signed);
    let status: ReviewStatus = 'new';
    let match: Transaction | null = null;

    if (importedIds.has(row.importId)) {
      status = 'imported';
    } else if (isCard && type === 'income') {
      status = 'card-payment';
    } else {
      match =
        manual.find(
          (t) =>
            !used.has(t.id) &&
            t.type === type &&
            t.amount_cents === amount &&
            Math.abs(differenceInCalendarDays(parseISODate(t.date), parseISODate(row.date))) <= DUPLICATE_WINDOW_DAYS,
        ) ?? null;
      if (match) {
        used.add(match.id);
        status = 'duplicate';
      }
    }

    return {
      ...row,
      key: row.importId,
      type,
      amount,
      status,
      include: status === 'new',
      categoryId: status === 'imported' ? null : suggestCategory(row.description, type, opts.history, opts.categories),
      match,
    };
  });
}

/** Linhas marcadas → lançamentos efetivados na conta escolhida. */
export function toTransactionInputs(rows: ReviewRow[], opts: { groupId: string; accountId: string }): TransactionInput[] {
  return rows
    .filter((r) => r.include && r.status !== 'imported')
    .map((r) => ({
      group_id: opts.groupId,
      type: r.type,
      status: 'posted' as const,
      amount_cents: r.amount,
      date: r.date,
      description: r.description.slice(0, 120),
      notes: null,
      account_id: opts.accountId,
      to_account_id: null,
      category_id: r.categoryId,
      import_id: r.importId,
      tags: [],
    }));
}

/**
 * Grava em lotes de 500. Linha já importada antes (mesma conta e import_id) é ignorada pelo banco.
 * Retorna quantos lançamentos foram criados. Depois chame useInvalidateFinance().
 */
export async function importTransactions(inputs: TransactionInput[]): Promise<number> {
  let created = 0;
  for (let i = 0; i < inputs.length; i += 500) {
    const { data, error } = await supabase
      .from('transactions')
      .upsert(inputs.slice(i, i + 500), { onConflict: 'account_id,import_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    created += (data ?? []).length;
  }
  return created;
}
