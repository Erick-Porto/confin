import { isEffective } from '@/lib/rules';
import { topLevelId } from '@/lib/categories';
import { ownerLabel } from '@/lib/accounts';
import { todayISO } from '@/lib/format';
import type { Period } from '@/lib/period';
import type { Account, Category, CategoryKind, ISODate, Member, Transaction } from '@/types';

export const NO_CATEGORY_ID = 'none';
export const OTHERS_ID = 'others';
const NEUTRAL_COLOR = '#94A3B8';

export interface SliceChild {
  id: string;
  name: string;
  color: string;
  icon: string;
  cents: number;
  /** Fração do total da categoria principal. */
  ratio: number;
}

export interface CategorySlice {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** null = "Sem categoria". */
  category: Category | null;
  cents: number;
  /** Fração do total do tipo no período. */
  ratio: number;
  children: SliceChild[];
}

/** Lançamentos efetivados do tipo, somados por categoria principal (subcategorias dentro). Ordem desc. */
export function expensesByCategory(
  txs: Transaction[],
  categories: Category[],
  kind: CategoryKind = 'expense',
  today: ISODate = todayISO(),
): CategorySlice[] {
  const byTop = new Map<string, { total: number; direct: Map<string, number> }>();
  let grand = 0;
  for (const tx of txs) {
    if (tx.type !== kind || !isEffective(tx, today)) continue;
    const topId = tx.category_id ? topLevelId(tx.category_id, categories) : NO_CATEGORY_ID;
    const ownId = tx.category_id ?? NO_CATEGORY_ID;
    const entry = byTop.get(topId) ?? { total: 0, direct: new Map<string, number>() };
    entry.total += tx.amount_cents;
    entry.direct.set(ownId, (entry.direct.get(ownId) ?? 0) + tx.amount_cents);
    byTop.set(topId, entry);
    grand += tx.amount_cents;
  }
  const slices: CategorySlice[] = [];
  for (const [topId, entry] of byTop) {
    const category = categories.find((c) => c.id === topId) ?? null;
    const children: SliceChild[] = [];
    for (const [ownId, cents] of entry.direct) {
      if (ownId === topId) continue;
      const child = categories.find((c) => c.id === ownId);
      children.push({
        id: ownId,
        name: child?.name ?? 'Sem categoria',
        color: child?.color ?? NEUTRAL_COLOR,
        icon: child?.icon ?? 'tag',
        cents,
        ratio: entry.total > 0 ? cents / entry.total : 0,
      });
    }
    children.sort((a, b) => b.cents - a.cents);
    slices.push({
      id: category?.id ?? NO_CATEGORY_ID,
      name: category?.name ?? 'Sem categoria',
      color: category?.color ?? NEUTRAL_COLOR,
      icon: category?.icon ?? 'tag',
      category,
      cents: entry.total,
      ratio: grand > 0 ? entry.total / grand : 0,
      children,
    });
  }
  return slices.sort((a, b) => b.cents - a.cents);
}

export interface DonutDatum {
  id: string;
  name: string;
  color: string;
  cents: number;
  ratio: number;
}

/** Os `max` maiores e o resto agrupado em "Outros". */
export function topWithOthers(slices: CategorySlice[], max = 5): DonutDatum[] {
  const toDatum = (s: CategorySlice): DonutDatum => ({ id: s.id, name: s.name, color: s.color, cents: s.cents, ratio: s.ratio });
  if (slices.length <= max) return slices.map(toDatum);
  const head = slices.slice(0, max).map(toDatum);
  const rest = slices.slice(max);
  head.push({
    id: OTHERS_ID,
    name: 'Outros',
    color: NEUTRAL_COLOR,
    cents: rest.reduce((s, r) => s + r.cents, 0),
    ratio: rest.reduce((s, r) => s + r.ratio, 0),
  });
  return head;
}

export interface PeriodTotals {
  period: Period;
  income: number;
  expense: number;
  net: number;
  /** resultado ÷ entradas; null sem entradas. */
  savingsRate: number | null;
}

/** Entradas e saídas efetivadas (sem transferências) de cada período. */
export function totalsByPeriod(txs: Transaction[], periods: Period[], today: ISODate = todayISO()): PeriodTotals[] {
  return periods.map((period) => {
    let income = 0;
    let expense = 0;
    for (const tx of txs) {
      if (tx.date < period.start || tx.date > period.end) continue;
      if (!isEffective(tx, today)) continue;
      if (tx.type === 'income') income += tx.amount_cents;
      else if (tx.type === 'expense') expense += tx.amount_cents;
    }
    const net = income - expense;
    return { period, income, expense, net, savingsRate: income > 0 ? net / income : null };
  });
}

export interface OwnerTotal {
  key: string;
  label: string;
  cents: number;
  ratio: number;
}

/** Saídas efetivadas agrupadas pelo titular da conta usada. Titular nulo = "Conjunta". */
export function expensesByOwner(
  txs: Transaction[],
  accounts: Account[],
  members: Member[],
  today: ISODate = todayISO(),
): OwnerTotal[] {
  const byOwner = new Map<string, number>();
  let grand = 0;
  for (const tx of txs) {
    if (tx.type !== 'expense' || !isEffective(tx, today)) continue;
    const account = accounts.find((a) => a.id === tx.account_id);
    const key = account?.owner_id ?? 'joint';
    byOwner.set(key, (byOwner.get(key) ?? 0) + tx.amount_cents);
    grand += tx.amount_cents;
  }
  return [...byOwner.entries()]
    .map(([key, cents]) => ({
      key,
      label: key === 'joint' ? 'Conjunta' : ownerLabel(key, members),
      cents,
      ratio: grand > 0 ? cents / grand : 0,
    }))
    .sort((a, b) => b.cents - a.cents);
}

export interface BudgetStatus {
  category: Category;
  spent: number;
  budget: number;
  ratio: number;
}

/** Gasto efetivado (com subcategorias) de cada categoria de saída ativa que tem orçamento. Ordem: maior uso primeiro. */
export function budgetStatuses(txs: Transaction[], categories: Category[], today: ISODate = todayISO()): BudgetStatus[] {
  const direct = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== 'expense' || !tx.category_id || !isEffective(tx, today)) continue;
    direct.set(tx.category_id, (direct.get(tx.category_id) ?? 0) + tx.amount_cents);
  }
  return categories
    .filter((c) => c.kind === 'expense' && !c.archived && c.monthly_budget_cents && c.monthly_budget_cents > 0)
    .map((category) => {
      let spent = direct.get(category.id) ?? 0;
      if (!category.parent_id) {
        for (const child of categories) if (child.parent_id === category.id) spent += direct.get(child.id) ?? 0;
      }
      const budget = category.monthly_budget_cents ?? 0;
      return { category, spent, budget, ratio: budget > 0 ? spent / budget : 0 };
    })
    .sort((a, b) => b.ratio - a.ratio);
}
