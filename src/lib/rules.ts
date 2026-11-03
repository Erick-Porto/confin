import type { ISODate, Transaction } from '@/types';
import { todayISO } from './format';

/**
 * Regras de negócio compartilhadas. Use sempre estas funções para que painel,
 * extrato e relatórios contem do mesmo jeito.
 *
 * - Efetivado: status 'posted' e data até hoje. É o que entra no saldo e nos totais.
 * - Agendado: status 'posted' com data futura (ex.: parcelas futuras). Vira efetivado sozinho na data.
 * - Previsto: status 'planned' (ex.: gerado por recorrência). Precisa ser confirmado.
 * - Transferências nunca entram em entradas, saídas ou % por categoria.
 */

export function isEffective(tx: Pick<Transaction, 'status' | 'date'>, today: ISODate = todayISO()): boolean {
  return tx.status === 'posted' && tx.date <= today;
}

export function isScheduled(tx: Pick<Transaction, 'status' | 'date'>, today: ISODate = todayISO()): boolean {
  return tx.status === 'posted' && tx.date > today;
}

export function isPlanned(tx: Pick<Transaction, 'status'>): boolean {
  return tx.status === 'planned';
}

/** Efeito do lançamento no saldo de uma conta, em centavos com sinal. */
export function signedAmountForAccount(
  tx: Pick<Transaction, 'type' | 'amount_cents' | 'account_id' | 'to_account_id'>,
  accountId: string,
): number {
  if (tx.type === 'income') return tx.account_id === accountId ? tx.amount_cents : 0;
  if (tx.type === 'expense') return tx.account_id === accountId ? -tx.amount_cents : 0;
  if (tx.account_id === accountId) return -tx.amount_cents;
  if (tx.to_account_id === accountId) return tx.amount_cents;
  return 0;
}

/** Entradas e saídas efetivadas (sem transferências). */
export function sumIncomeExpense(
  txs: Transaction[],
  opts: { includePlanned?: boolean; today?: ISODate } = {},
): { income: number; expense: number; net: number } {
  const today = opts.today ?? todayISO();
  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    const counts = opts.includePlanned ? true : isEffective(tx, today);
    if (!counts) continue;
    if (tx.type === 'income') income += tx.amount_cents;
    else if (tx.type === 'expense') expense += tx.amount_cents;
  }
  return { income, expense, net: income - expense };
}

/** Divide um total em N parcelas; a diferença de centavos vai para a primeira. */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}
