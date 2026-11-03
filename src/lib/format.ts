import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ISODate } from '@/types';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 123456 -> "R$ 1.234,56". Com signed, positivos ganham "+". */
export function formatCents(cents: number, opts: { signed?: boolean } = {}): string {
  const text = brl.format(cents / 100);
  if (opts.signed && cents > 0) return `+${text}`;
  return text;
}

/** Valor curto para eixos de gráfico: "R$ 1,2 mil". */
export function formatCentsCompact(cents: number): string {
  return brlCompact.format(cents / 100);
}

/** Percentual com uma casa: 0.384 -> "38,4%". */
export function formatPercent(ratio: number, digits = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(ratio);
}

/**
 * Converte o que o usuário digitou em centavos. Aceita "1.234,56", "1234,5", "1234" e "1234.56".
 * Retorna null se não for um número válido.
 */
export function parseAmountToCents(input: string): number | null {
  const raw = input.trim().replace(/[R$\s]/g, '');
  if (!raw) return null;
  let normalized: string;
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, ''); // "1.234" = mil duzentos e trinta e quatro
  } else {
    normalized = raw;
  }
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

/** Centavos -> texto editável "1234,56" (sem símbolo). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Date local -> "YYYY-MM-DD" (sem converter para UTC). */
export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" -> Date local à meia-noite. */
export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Hoje no fuso do aparelho, como "YYYY-MM-DD". */
export function todayISO(): ISODate {
  return toISODate(new Date());
}

/** "2026-11-03" -> "03/11/2026". */
export function formatDate(iso: ISODate): string {
  return format(parseISODate(iso), 'dd/MM/yyyy');
}

/** "2026-11-03" -> "3 nov". */
export function formatShortDate(iso: ISODate): string {
  return format(parseISODate(iso), "d MMM", { locale: ptBR });
}

/** Cabeçalho de dia no extrato: "Hoje", "Ontem" ou "seg, 3 nov". */
export function formatDayHeader(iso: ISODate): string {
  const date = parseISODate(iso);
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "EEE, d MMM", { locale: ptBR });
}

/** "novembro de 2026". */
export function formatMonthYear(date: Date): string {
  return format(date, "MMMM 'de' yyyy", { locale: ptBR });
}

/** Primeiro nome de um nome completo. */
export function firstName(fullName: string | null | undefined, fallback = 'Membro'): string {
  const name = fullName?.trim().split(/\s+/)[0];
  return name || fallback;
}
