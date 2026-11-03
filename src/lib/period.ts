import { addDays, addMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ISODate } from '@/types';
import { formatMonthYear, parseISODate, toISODate } from './format';

/**
 * Mês financeiro. Com startDay = 1 é o mês do calendário; com startDay = 5 vai de 5/nov a 4/dez.
 * `start` e `end` são inclusivos.
 */
export interface Period {
  start: ISODate;
  end: ISODate;
  /** "novembro de 2026" ou "5 nov – 4 dez". */
  label: string;
  /** Chave estável para query keys e URLs: igual a `start`. */
  key: ISODate;
}

function clampStartDay(startDay: number): number {
  return Math.min(Math.max(Math.trunc(startDay) || 1, 1), 28);
}

function build(startDate: Date, startDay: number): Period {
  const end = addDays(addMonths(startDate, 1), -1);
  const start = toISODate(startDate);
  const label =
    startDay === 1
      ? formatMonthYear(startDate)
      : `${format(startDate, 'd MMM', { locale: ptBR })} – ${format(end, 'd MMM', { locale: ptBR })}`;
  return { start, end: toISODate(end), label, key: start };
}

/** Período que contém a data de referência. */
export function getPeriod(ref: Date | ISODate = new Date(), startDay = 1): Period {
  const day = clampStartDay(startDay);
  const date = typeof ref === 'string' ? parseISODate(ref) : ref;
  let start = new Date(date.getFullYear(), date.getMonth(), day);
  if (date.getDate() < day) start = addMonths(start, -1);
  return build(start, day);
}

/** Período n meses antes (n < 0) ou depois (n > 0). */
export function shiftPeriod(period: Period, n: number, startDay = 1): Period {
  const day = clampStartDay(startDay);
  return build(addMonths(parseISODate(period.start), n), day);
}

/** Os últimos `count` períodos, do mais antigo para o atual. */
export function lastPeriods(count: number, startDay = 1, ref: Date | ISODate = new Date()): Period[] {
  const current = getPeriod(ref, startDay);
  return Array.from({ length: count }, (_, i) => shiftPeriod(current, i - (count - 1), startDay));
}

/** A data está dentro do período? */
export function inPeriod(date: ISODate, period: Period): boolean {
  return date >= period.start && date <= period.end;
}
