import type {
  Account,
  AccountBalanceAt,
  AccountWithBalance,
  ISODate,
  Investment,
  InvestmentClass,
  InvestmentValue,
  Transaction,
} from '@/types';
import { isEffective } from '@/lib/rules';
import { todayISO } from '@/lib/format';

/**
 * Patrimônio e investimentos (Fase 4). Regras:
 *
 * - Cada aplicação começa com uma posição de abertura (valor de mercado e custo no início do dia de abertura).
 * - Lançamentos ligados (transactions.investment_id) e efetivados contam a partir do dia de abertura:
 *   aporte = transferência para a conta da aplicação; resgate = transferência saindo dela;
 *   provento = entrada na conta; custo = saída na conta (taxa, IR).
 * - Valor de mercado = último valor informado (fim daquele dia) + aportes − resgates depois dele.
 *   Sem valor informado, parte da abertura.
 * - Aplicado = custo de abertura + aportes − resgates. Lucro = valor − aplicado + proventos − custos.
 *   Rentabilidade simples = lucro ÷ aplicado.
 * - Conta de investimento no patrimônio = soma das aplicações + dinheiro parado
 *   (saldo contábil − base das aplicações, nunca negativo). Conta sem aplicações = saldo contábil.
 * - Patrimônio = soma de todas as contas (cartão de crédito entra negativo, como dívida), com as contas de
 *   investimento pelo valor de mercado.
 */

export const INVESTMENT_CLASS_LABELS: Record<InvestmentClass, string> = {
  fixed_income: 'Renda fixa',
  treasury: 'Tesouro Direto',
  stocks: 'Ações',
  reits: 'Fundos imobiliários',
  funds: 'Fundos',
  crypto: 'Cripto',
  pension: 'Previdência',
  other: 'Outros',
};

export const INVESTMENT_CLASS_OPTIONS = (Object.keys(INVESTMENT_CLASS_LABELS) as InvestmentClass[]).map((value) => ({
  value,
  label: INVESTMENT_CLASS_LABELS[value],
}));

/** Cor fixa por classe, para a alocação da carteira. */
export const INVESTMENT_CLASS_COLORS: Record<InvestmentClass, string> = {
  fixed_income: '#0F766E',
  treasury: '#2563EB',
  stocks: '#DC2626',
  reits: '#D97706',
  funds: '#7C3AED',
  crypto: '#CA8A04',
  pension: '#DB2777',
  other: '#64748B',
};

export type FlowKind = 'contribution' | 'withdrawal' | 'income' | 'cost';

export const FLOW_KIND_LABELS: Record<FlowKind, string> = {
  contribution: 'Aporte',
  withdrawal: 'Resgate',
  income: 'Provento',
  cost: 'Custo',
};

/** Papel do lançamento para a aplicação, ou null se ele não usa a conta dela. */
export function flowKind(
  tx: Pick<Transaction, 'type' | 'account_id' | 'to_account_id'>,
  inv: Pick<Investment, 'account_id'>,
): FlowKind | null {
  if (tx.type === 'transfer') {
    if (tx.to_account_id === inv.account_id) return 'contribution';
    if (tx.account_id === inv.account_id) return 'withdrawal';
    return null;
  }
  if (tx.account_id !== inv.account_id) return null;
  return tx.type === 'income' ? 'income' : 'cost';
}

export interface Position {
  investment: Investment;
  /** Valor de mercado estimado na data. */
  value: number;
  /** Data do último valor informado (ou da abertura). */
  valueDate: ISODate;
  /** true quando o valor veio só da abertura (nenhum valor informado ainda). */
  fromOpening: boolean;
  /** Custo de abertura + aportes − resgates. */
  invested: number;
  /** Proventos − custos. */
  income: number;
  /** valor − aplicado + proventos líquidos. */
  profit: number;
  /** lucro ÷ aplicado; null quando aplicado <= 0. */
  profitRatio: number | null;
  /** Valor de abertura + aportes − resgates (para achar o dinheiro parado na conta). */
  basis: number;
}

/**
 * Posição de uma aplicação no fim de `date`, ou null se ela ainda não existia.
 * @param values valores informados (pode passar todos do grupo)
 * @param flows lançamentos ligados (pode passar todos de useInvestmentFlows)
 */
export function positionAt(
  inv: Investment,
  values: InvestmentValue[],
  flows: Transaction[],
  date: ISODate = todayISO(),
): Position | null {
  if (inv.opening_date > date) return null;

  let latest: InvestmentValue | null = null;
  for (const v of values) {
    if (v.investment_id !== inv.id || v.date < inv.opening_date || v.date > date) continue;
    if (!latest || v.date > latest.date) latest = v;
  }

  let net = 0;
  let netAfterLatest = 0;
  let income = 0;
  for (const tx of flows) {
    if (tx.investment_id !== inv.id || tx.date < inv.opening_date || !isEffective(tx, date)) continue;
    const kind = flowKind(tx, inv);
    if (kind === 'contribution' || kind === 'withdrawal') {
      const signed = kind === 'contribution' ? tx.amount_cents : -tx.amount_cents;
      net += signed;
      if (!latest || tx.date > latest.date) netAfterLatest += signed;
    } else if (kind === 'income') {
      income += tx.amount_cents;
    } else if (kind === 'cost') {
      income -= tx.amount_cents;
    }
  }

  const value = Math.max(0, (latest ? latest.value_cents : inv.opening_value_cents) + netAfterLatest);
  const invested = inv.opening_cost_cents + net;
  const profit = value - invested + income;
  return {
    investment: inv,
    value,
    valueDate: latest ? latest.date : inv.opening_date,
    fromOpening: !latest,
    invested,
    income,
    profit,
    profitRatio: invested > 0 ? profit / invested : null,
    basis: inv.opening_value_cents + net,
  };
}

/** Valor de uma conta de investimento: aplicações + dinheiro parado (nunca negativo). Sem aplicações = saldo contábil. */
export function accountMarketValue(accountId: string, bookBalance: number, positions: Position[]): number {
  const own = positions.filter((p) => p.investment.account_id === accountId);
  if (own.length === 0) return bookBalance;
  const value = own.reduce((s, p) => s + p.value, 0);
  const basis = own.reduce((s, p) => s + p.basis, 0);
  return value + Math.max(0, bookBalance - basis);
}

export interface ClassAllocation {
  class: InvestmentClass;
  value: number;
  /** 0 a 1, sobre o valor total das aplicações. */
  share: number;
}

export interface Portfolio {
  /** Todas as aplicações já abertas (inclusive arquivadas), maior valor primeiro. */
  positions: Position[];
  totalValue: number;
  totalInvested: number;
  totalIncome: number;
  totalProfit: number;
  profitRatio: number | null;
  /** Dinheiro parado nas contas de investimento (fora de qualquer aplicação). */
  cash: number;
  /** Alocação por classe (só classes com valor), maior primeiro. */
  byClass: ClassAllocation[];
}

/** Carteira hoje. `accounts` com saldo atual (useAccounts). */
export function portfolio(
  investments: Investment[],
  values: InvestmentValue[],
  flows: Transaction[],
  accounts: AccountWithBalance[],
  date: ISODate = todayISO(),
): Portfolio {
  const positions = investments
    .map((inv) => positionAt(inv, values, flows, date))
    .filter((p): p is Position => p !== null)
    .sort((a, b) => b.value - a.value);

  let cash = 0;
  for (const acc of accounts) {
    if (acc.type !== 'investment') continue;
    const own = positions.filter((p) => p.investment.account_id === acc.id);
    if (own.length === 0) continue;
    cash += accountMarketValue(acc.id, acc.balance_cents, positions) - own.reduce((s, p) => s + p.value, 0);
  }

  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const totalInvested = positions.reduce((s, p) => s + p.invested, 0);
  const totalIncome = positions.reduce((s, p) => s + p.income, 0);
  const totalProfit = positions.reduce((s, p) => s + p.profit, 0);

  const sums = new Map<InvestmentClass, number>();
  for (const p of positions) {
    if (p.value > 0) sums.set(p.investment.class, (sums.get(p.investment.class) ?? 0) + p.value);
  }
  const byClass = [...sums.entries()]
    .map(([cls, value]) => ({ class: cls, value, share: totalValue > 0 ? value / totalValue : 0 }))
    .sort((a, b) => b.value - a.value);

  return {
    positions,
    totalValue,
    totalInvested,
    totalIncome,
    totalProfit,
    profitRatio: totalInvested > 0 ? totalProfit / totalInvested : null,
    cash,
    byClass,
  };
}

export interface NetWorthPoint {
  date: ISODate;
  /** Patrimônio total. */
  total: number;
  /** Parte em contas de investimento (pelo valor de mercado). */
  investments: number;
}

/** Patrimônio numa data, a partir dos saldos contábeis das contas nessa data. */
export function netWorthAt(
  date: ISODate,
  balances: Map<string, number>,
  accounts: Array<Pick<Account, 'id' | 'type'>>,
  investments: Investment[],
  values: InvestmentValue[],
  flows: Transaction[],
): NetWorthPoint {
  const positions = investments
    .map((inv) => positionAt(inv, values, flows, date))
    .filter((p): p is Position => p !== null);
  let total = 0;
  let inInvestments = 0;
  for (const acc of accounts) {
    const book = balances.get(acc.id) ?? 0;
    if (acc.type === 'investment') {
      const v = accountMarketValue(acc.id, book, positions);
      total += v;
      inInvestments += v;
    } else {
      total += book;
    }
  }
  return { date, total, investments: inInvestments };
}

/**
 * Série do patrimônio para as datas pedidas (as mesmas passadas a useAccountBalancesAt), na ordem recebida.
 * Use o menor entre o fim de cada período e hoje.
 */
export function netWorthSeries(
  dates: ISODate[],
  rows: AccountBalanceAt[],
  accounts: Array<Pick<Account, 'id' | 'type'>>,
  investments: Investment[],
  values: InvestmentValue[],
  flows: Transaction[],
): NetWorthPoint[] {
  const byDate = new Map<ISODate, Map<string, number>>();
  for (const r of rows) {
    let m = byDate.get(r.as_of);
    if (!m) {
      m = new Map();
      byDate.set(r.as_of, m);
    }
    m.set(r.account_id, r.balance_cents);
  }
  return dates.map((d) => netWorthAt(d, byDate.get(d) ?? new Map(), accounts, investments, values, flows));
}
