import { addDays, addMonths, getDaysInMonth } from 'date-fns';
import { parseISODate, toISODate } from '@/lib/format';
import type { Account, ISODate } from '@/types';

/** Campos do cartão usados nos cálculos de fatura. */
export type CardDays = Pick<Account, 'closing_day' | 'due_day'>;

export interface StatementRange {
  /** Primeiro dia de compras da fatura (fechamento anterior, inclusivo). */
  start: ISODate;
  /** Último dia de compras (fechamento − 1 dia, inclusivo). */
  end: ISODate;
}

export type StatementStatus = 'aberta' | 'fechada' | 'paga' | 'vencida' | 'sem-gastos';

/** Limita o dia ao tamanho do mês (31 em fevereiro vira 28/29). */
export function clampDay(year: number, monthIndex: number, day: number): Date {
  const size = getDaysInMonth(new Date(year, monthIndex, 1));
  return new Date(year, monthIndex, Math.min(Math.max(day, 1), size));
}

function closingDay(card: CardDays): number {
  return card.closing_day ?? 1;
}

function dueDay(card: CardDays): number {
  return card.due_day ?? 1;
}

/** Fechamento do mês (ano/mês de `ref`), com o dia limitado ao mês. */
function closingInMonth(card: CardDays, ref: Date): Date {
  return clampDay(ref.getFullYear(), ref.getMonth(), closingDay(card));
}

/**
 * Data de fechamento da fatura a que uma compra pertence.
 * Convenção brasileira: compra NO dia do fechamento vai para a próxima fatura.
 */
export function statementClosingFor(card: CardDays, purchaseDate: ISODate): ISODate {
  const date = parseISODate(purchaseDate);
  const thisMonth = closingInMonth(card, date);
  if (date < thisMonth) return toISODate(thisMonth);
  return toISODate(closingInMonth(card, addMonths(new Date(date.getFullYear(), date.getMonth(), 1), 1)));
}

/** Compras da fatura: do fechamento anterior (inclusive) até o dia anterior a `closingDate`. */
export function statementRange(card: CardDays, closingDate: ISODate): StatementRange {
  const closing = parseISODate(closingDate);
  const prev = closingInMonth(card, addMonths(new Date(closing.getFullYear(), closing.getMonth(), 1), -1));
  return { start: toISODate(prev), end: toISODate(addDays(closing, -1)) };
}

/** Vencimento: no mesmo mês do fechamento se due_day > closing_day, senão no mês seguinte. */
export function statementDueDate(card: CardDays, closingDate: ISODate): ISODate {
  const closing = parseISODate(closingDate);
  const offset = dueDay(card) > closingDay(card) ? 0 : 1;
  const base = addMonths(new Date(closing.getFullYear(), closing.getMonth(), 1), offset);
  return toISODate(clampDay(base.getFullYear(), base.getMonth(), dueDay(card)));
}

/** Fatura aberta hoje (a que recebe as compras de hoje). */
export function currentStatementClosing(card: CardDays, today: ISODate): ISODate {
  return statementClosingFor(card, today);
}

/** Fatura n meses depois (n negativo = anteriores). */
export function shiftStatement(card: CardDays, closingDate: ISODate, n: number): ISODate {
  const closing = parseISODate(closingDate);
  const base = addMonths(new Date(closing.getFullYear(), closing.getMonth(), 1), n);
  return toISODate(clampDay(base.getFullYear(), base.getMonth(), closingDay(card)));
}

export function statementStatus(args: {
  today: ISODate;
  closingDate: ISODate;
  dueDate: ISODate;
  totalCents: number;
  paidCents: number;
}): StatementStatus {
  const { today, closingDate, dueDate, totalCents, paidCents } = args;
  if (totalCents <= 0) return 'sem-gastos';
  if (paidCents >= totalCents) return 'paga';
  if (today > dueDate) return 'vencida';
  if (today < closingDate) return 'aberta';
  return 'fechada';
}
