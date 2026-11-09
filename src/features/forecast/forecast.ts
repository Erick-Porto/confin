import { addDays, differenceInCalendarDays } from 'date-fns';
import type { Account, AccountWithBalance, ISODate, Recurrence, Transaction } from '@/types';
import { isEffective } from '@/lib/rules';
import { parseISODate, todayISO, toISODate } from '@/lib/format';
import { occurrenceDate } from '@/features/recurrences/schedule';
import { currentStatementClosing, shiftStatement, statementDueDate } from '@/lib/card';

/**
 * Previsão e agenda (Fase 5).
 *
 * Saldo disponível = soma das contas que não são de investimento (cartão entra negativo, como dívida).
 * Assim a compra no cartão pesa no dia da compra, e pagar a fatura não muda o total.
 * Transferências só mexem no disponível quando entram ou saem de conta de investimento (aporte, resgate).
 *
 * Projeção: parte do disponível de hoje e soma, dia a dia, o que já se sabe:
 * - lançamentos agendados (posted com data futura) e previstos (planned), inclusive previstos atrasados, que
 *   entram no dia de hoje;
 * - ocorrências das recorrências ativas depois do que o banco já gerou (generated_until);
 * - opcional: média diária dos gastos variáveis (saídas efetivadas sem recorrência e sem parcela).
 */

export const FORECAST_DAYS = 180;
export const VARIABLE_WINDOW_DAYS = 90;

type Flow = Pick<Transaction, 'type' | 'amount_cents' | 'account_id' | 'to_account_id'>;

/** Efeito no saldo disponível (contas fora de investimento), em centavos com sinal. */
export function availableDelta(tx: Flow, investAccounts: Set<string>): number {
  const fromInvest = investAccounts.has(tx.account_id);
  if (tx.type === 'income') return fromInvest ? 0 : tx.amount_cents;
  if (tx.type === 'expense') return fromInvest ? 0 : -tx.amount_cents;
  const toInvest = !!tx.to_account_id && investAccounts.has(tx.to_account_id);
  if (fromInvest === toInvest) return 0;
  return toInvest ? -tx.amount_cents : tx.amount_cents;
}

export type ForecastSource = 'scheduled' | 'planned' | 'recurrence';

export interface ForecastItem {
  date: ISODate;
  description: string;
  /** Efeito no disponível, com sinal. */
  amount: number;
  source: ForecastSource;
  transaction?: Transaction;
  recurrence?: Recurrence;
}

export interface ForecastPoint {
  date: ISODate;
  balance: number;
}

export interface Forecast {
  /** Disponível hoje (só efetivados). */
  start: number;
  /** Um ponto por dia, de hoje até o fim do horizonte. */
  points: ForecastPoint[];
  end: number;
  lowest: ForecastPoint;
  /** Primeiro dia com saldo negativo, se houver. */
  firstNegative: ForecastPoint | null;
  /** O que já se sabe que vai acontecer, por data (sem a média de variáveis). */
  items: ForecastItem[];
  /** Gasto variável médio por dia usado na projeção (0 quando desligado). */
  dailyVariable: number;
}

/**
 * @param transactions lançamentos de VARIABLE_WINDOW_DAYS dias atrás até o fim do horizonte (todos os status)
 * @param recurrences recorrências do grupo (useRecurrences)
 */
export function buildForecast(opts: {
  accounts: AccountWithBalance[];
  transactions: Transaction[];
  recurrences: Recurrence[];
  today?: ISODate;
  horizonDays?: number;
  includeVariable?: boolean;
}): Forecast {
  const today = opts.today ?? todayISO();
  const horizon = toISODate(addDays(parseISODate(today), opts.horizonDays ?? FORECAST_DAYS));
  const invest = new Set(opts.accounts.filter((a) => a.type === 'investment').map((a) => a.id));
  const start = opts.accounts.filter((a) => !invest.has(a.id)).reduce((s, a) => s + a.balance_cents, 0);

  const items: ForecastItem[] = [];
  let variableTotal = 0;
  let earliest = today;
  for (const tx of opts.transactions) {
    if (tx.date < earliest) earliest = tx.date;
    if (isEffective(tx, today)) {
      const windowStart = toISODate(addDays(parseISODate(today), -VARIABLE_WINDOW_DAYS + 1));
      if (
        tx.type === 'expense' &&
        tx.date >= windowStart &&
        !tx.recurrence_id &&
        !tx.installment_group_id &&
        !invest.has(tx.account_id)
      ) {
        variableTotal += tx.amount_cents;
      }
      continue;
    }
    if (tx.date > horizon) continue;
    const amount = availableDelta(tx, invest);
    if (amount === 0) continue;
    items.push({
      date: tx.date < today ? today : tx.date,
      description: tx.description,
      amount,
      source: tx.status === 'planned' ? 'planned' : 'scheduled',
      transaction: tx,
    });
  }

  for (const rec of opts.recurrences) {
    if (!rec.active) continue;
    const after = rec.generated_until && rec.generated_until > today ? rec.generated_until : today;
    for (let n = 0; n < 2000; n++) {
      const date = occurrenceDate(rec, n);
      if (date > horizon || (rec.end_date && date > rec.end_date)) break;
      if (date <= after) continue;
      const amount = availableDelta(rec, invest);
      if (amount !== 0) items.push({ date, description: rec.description, amount, source: 'recurrence', recurrence: rec });
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const spanDays = Math.min(VARIABLE_WINDOW_DAYS, differenceInCalendarDays(parseISODate(today), parseISODate(earliest)) + 1);
  const dailyVariable = opts.includeVariable && spanDays > 0 ? Math.round(variableTotal / spanDays) : 0;

  const byDate = new Map<ISODate, number>();
  for (const it of items) byDate.set(it.date, (byDate.get(it.date) ?? 0) + it.amount);

  const points: ForecastPoint[] = [];
  let balance = start;
  let lowest: ForecastPoint = { date: today, balance: start };
  let firstNegative: ForecastPoint | null = null;
  for (let d = parseISODate(today), i = 0; toISODate(d) <= horizon; d = addDays(d, 1), i++) {
    const date = toISODate(d);
    balance += byDate.get(date) ?? 0;
    if (i > 0) balance -= dailyVariable;
    const point = { date, balance };
    points.push(point);
    if (balance < lowest.balance) lowest = point;
    if (!firstNegative && balance < 0) firstNegative = point;
  }

  return { start, points, end: balance, lowest, firstNegative, items, dailyVariable };
}

/** Saldo projetado no fim do dia `date` (o último ponto se a data passar do horizonte). */
export function balanceOn(forecast: Forecast, date: ISODate): number {
  let last = forecast.start;
  for (const p of forecast.points) {
    if (p.date > date) break;
    last = p.balance;
  }
  return last;
}

// ---------------------------------------------------------------------------
// Agenda: contas a pagar e a receber
// ---------------------------------------------------------------------------

export const AGENDA_DAYS = 30;

export interface CardDue {
  account: Account;
  closingDate: ISODate;
  dueDate: ISODate;
}

export interface Agenda {
  /** Previstos com data passada (precisam ser confirmados ou excluídos). */
  overdue: Transaction[];
  today: Transaction[];
  /** Amanhã até 7 dias. */
  week: Transaction[];
  /** De 8 a AGENDA_DAYS dias. */
  later: Transaction[];
  /** Faturas de cartão que vencem de hoje até AGENDA_DAYS dias. */
  cards: CardDue[];
  /** Soma das saídas e pagamentos de fatura listados. */
  toPay: number;
  /** Soma das entradas listadas. */
  toReceive: number;
}

/**
 * Lista o que vence: entradas e saídas previstas ou agendadas, e transferências para cartão (pagar fatura).
 * @param transactions lançamentos de 30 dias atrás até AGENDA_DAYS dias à frente (todos os status)
 */
export function buildAgenda(transactions: Transaction[], accounts: Account[], today: ISODate = todayISO()): Agenda {
  const end = toISODate(addDays(parseISODate(today), AGENDA_DAYS));
  const weekEnd = toISODate(addDays(parseISODate(today), 7));
  const cardIds = new Set(accounts.filter((a) => a.type === 'credit_card').map((a) => a.id));
  const agenda: Agenda = { overdue: [], today: [], week: [], later: [], cards: [], toPay: 0, toReceive: 0 };

  for (const tx of transactions) {
    const pending = tx.status === 'planned' || tx.date > today;
    if (!pending || tx.date > end) continue;
    const cardPayment = tx.type === 'transfer' && !!tx.to_account_id && cardIds.has(tx.to_account_id);
    if (tx.type === 'transfer' && !cardPayment) continue;
    if (tx.date < today) agenda.overdue.push(tx);
    else if (tx.date === today) agenda.today.push(tx);
    else if (tx.date <= weekEnd) agenda.week.push(tx);
    else agenda.later.push(tx);
    if (tx.type === 'income') agenda.toReceive += tx.amount_cents;
    else agenda.toPay += tx.amount_cents;
  }
  const byDate = (a: Transaction, b: Transaction) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  agenda.overdue.sort(byDate);
  agenda.today.sort(byDate);
  agenda.week.sort(byDate);
  agenda.later.sort(byDate);

  for (const card of accounts) {
    if (card.type !== 'credit_card' || card.archived || !card.closing_day || !card.due_day) continue;
    const current = currentStatementClosing(card, today);
    const seen = new Set<ISODate>();
    for (const n of [-1, 0, 1]) {
      const closingDate = shiftStatement(card, current, n);
      const dueDate = statementDueDate(card, closingDate);
      if (dueDate < today || dueDate > end || seen.has(dueDate)) continue;
      seen.add(dueDate);
      agenda.cards.push({ account: card, closingDate, dueDate });
    }
  }
  agenda.cards.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  return agenda;
}
