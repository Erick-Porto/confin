import type { Account, Category, Member, PlanBlock, Transaction } from '@/types';
import type { Period } from '@/lib/period';
import { accountLabel } from '@/lib/accounts';
import { categoryPath } from '@/lib/categories';
import { todayISO } from '@/lib/format';
import { isEffective, isPlanned, sumIncomeExpense } from '@/lib/rules';
import { planSummary } from '@/features/planning/plan';

/**
 * Dados do relatório do período (Fase 8), prontos para virar planilha (xlsx) ou PDF.
 * Mesmas regras do app: só efetivados nos totais, transferências fora de entradas e saídas,
 * subcategorias somadas na categoria principal. Valores em centavos.
 */

export interface ReportData {
  groupName: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  /** dd/mm/aaaa hh:mm */
  generatedAt: string;
  summary: {
    income: number;
    expense: number;
    /** entradas − saídas */
    net: number;
    /** sobra ÷ entradas; null sem entradas */
    savingsRate: number | null;
  };
  /** Saídas por categoria principal, maior primeiro. share = 0 a 1. */
  expenseCategories: Array<{ name: string; total: number; share: number }>;
  incomeCategories: Array<{ name: string; total: number; share: number }>;
  /** Planejado x realizado, quando o grupo tem plano. */
  plan: Array<{ name: string; percent: number; planned: number; done: number }> | null;
  /** Todos os lançamentos do período, por data. amount com sinal (saída negativa; transferência sem sinal). */
  transactions: Array<{
    date: string;
    description: string;
    type: string;
    status: string;
    category: string;
    account: string;
    toAccount: string;
    amount: number;
    tags: string;
  }>;
}

const TYPE_LABELS: Record<Transaction['type'], string> = { income: 'Entrada', expense: 'Saída', transfer: 'Transferência' };

function byCategory(txs: Transaction[], categories: Category[], kind: 'income' | 'expense', today: string) {
  const totals = new Map<string, number>();
  let all = 0;
  for (const tx of txs) {
    if (tx.type !== kind || !isEffective(tx, today)) continue;
    const cat = tx.category_id ? categories.find((c) => c.id === tx.category_id) : undefined;
    const top = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : cat;
    const name = top?.name ?? 'Sem categoria';
    totals.set(name, (totals.get(name) ?? 0) + tx.amount_cents);
    all += tx.amount_cents;
  }
  return [...totals.entries()]
    .map(([name, total]) => ({ name, total, share: all > 0 ? total / all : 0 }))
    .sort((a, b) => b.total - a.total);
}

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function buildReport(input: {
  groupName: string;
  period: Period;
  /** Lançamentos do período (todos os status). */
  txs: Transaction[];
  categories: Category[];
  accounts: Account[];
  members: Member[];
  planBlocks: PlanBlock[];
}): ReportData {
  const today = todayISO();
  const { income, expense } = sumIncomeExpense(input.txs, { today });
  const net = income - expense;
  const accName = (id: string | null) => {
    const a = id ? input.accounts.find((x) => x.id === id) : undefined;
    return a ? accountLabel(a, input.members) : '';
  };

  let plan: ReportData['plan'] = null;
  if (input.planBlocks.length > 0) {
    const summary = planSummary(input.txs, input.planBlocks, input.categories, input.accounts, today);
    plan = summary.blocks.map((b) => ({ name: b.block.name, percent: b.block.percent, planned: b.planned, done: b.done }));
  }

  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');

  return {
    groupName: input.groupName,
    periodLabel: input.period.label,
    periodStart: br(input.period.start),
    periodEnd: br(input.period.end),
    generatedAt: `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`,
    summary: { income, expense, net, savingsRate: income > 0 ? net / income : null },
    expenseCategories: byCategory(input.txs, input.categories, 'expense', today),
    incomeCategories: byCategory(input.txs, input.categories, 'income', today),
    plan,
    transactions: [...input.txs]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((t) => ({
        date: br(t.date),
        description: t.description,
        type: TYPE_LABELS[t.type],
        status: isPlanned(t) ? 'Previsto' : isEffective(t, today) ? 'Efetivado' : 'Agendado',
        category: t.type === 'transfer' ? '' : categoryPath(t.category_id, input.categories),
        account: accName(t.account_id),
        toAccount: accName(t.to_account_id),
        amount: t.type === 'expense' ? -t.amount_cents : t.amount_cents,
        tags: (t.tags ?? []).join(', '),
      })),
  };
}

/** Baixa um conteúdo (texto ou Blob) como arquivo. */
export function downloadFile(filename: string, content: string | Blob, mime = 'application/octet-stream'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
