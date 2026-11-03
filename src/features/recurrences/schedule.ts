import { addDays, addMonths, addYears, differenceInCalendarDays, differenceInCalendarMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDate, parseISODate, toISODate, todayISO } from '@/lib/format';
import type { ISODate, Recurrence } from '@/types';

type Rule = Pick<Recurrence, 'freq' | 'interval_count' | 'start_date' | 'end_date'>;

/** n-ésima ocorrência (n = 0 é a própria start_date). Meses curtos "encolhem" o dia, como no Postgres. */
export function occurrenceDate(rec: Rule, n: number): ISODate {
  const start = parseISODate(rec.start_date);
  const step = n * rec.interval_count;
  if (rec.freq === 'weekly') return toISODate(addDays(start, 7 * step));
  if (rec.freq === 'monthly') return toISODate(addMonths(start, step));
  return toISODate(addYears(start, step));
}

/** Primeira ocorrência em ou depois de `from` (e até end_date), ou null. */
export function nextOccurrence(rec: Rule, from: ISODate = todayISO()): ISODate | null {
  const start = parseISODate(rec.start_date);
  const target = parseISODate(from);
  let n = 0;
  if (target > start) {
    let estimate: number;
    if (rec.freq === 'weekly') estimate = differenceInCalendarDays(target, start) / (7 * rec.interval_count);
    else if (rec.freq === 'monthly') estimate = differenceInCalendarMonths(target, start) / rec.interval_count;
    else estimate = differenceInCalendarMonths(target, start) / (12 * rec.interval_count);
    n = Math.max(0, Math.floor(estimate) - 1);
  }
  for (let i = 0; i < 1000; i++, n++) {
    const date = occurrenceDate(rec, n);
    if (rec.end_date && date > rec.end_date) return null;
    if (date >= from) return date;
  }
  return null;
}

/** "Todo mês, dia 5", "A cada 2 semanas, sexta-feira", "Todo ano, 5 de novembro" (+ " · até dd/mm/aaaa"). */
export function describeRule(rec: Rule): string {
  const start = parseISODate(rec.start_date);
  const n = rec.interval_count;
  let text: string;
  if (rec.freq === 'weekly') {
    const weekday = format(start, 'EEEE', { locale: ptBR });
    text = n === 1 ? `Toda semana, ${weekday}` : `A cada ${n} semanas, ${weekday}`;
  } else if (rec.freq === 'monthly') {
    const day = start.getDate();
    text = n === 1 ? `Todo mês, dia ${day}` : `A cada ${n} meses, dia ${day}`;
  } else {
    const when = format(start, "d 'de' MMMM", { locale: ptBR });
    text = n === 1 ? `Todo ano, ${when}` : `A cada ${n} anos, ${when}`;
  }
  return rec.end_date ? `${text} · até ${formatDate(rec.end_date)}` : text;
}

/** Valor equivalente por mês, em centavos (semanal × 52/12, anual ÷ 12, dividido pelo intervalo). */
export function monthlyEquivalentCents(rec: Pick<Recurrence, 'freq' | 'interval_count' | 'amount_cents'>): number {
  const perMonth = rec.freq === 'weekly' ? 52 / 12 : rec.freq === 'monthly' ? 1 : 1 / 12;
  return Math.round((rec.amount_cents * perMonth) / rec.interval_count);
}
