import type { Account, Category, ISODate, PlanBlock, PlanBlockKind, Transaction } from '@/types';
import { isEffective } from '@/lib/rules';
import { todayISO } from '@/lib/format';
import { NO_CATEGORY_ID } from '@/features/dashboard/aggregate';

/**
 * Planejamento financeiro (Fase 3): a renda do período é dividida em blocos que somam 100%.
 *
 * - Renda do período: entradas efetivadas, agendadas e previstas, fora as que caem em contas de investimento
 *   (rendimentos não aumentam o plano).
 * - Bloco de gasto: soma as saídas das categorias ligadas a ele (subcategorias contam pela categoria pai).
 * - Bloco de investimento: soma as saídas ligadas a ele e os aportes líquidos (transferências para contas de
 *   investimento menos resgates). Os aportes contam no primeiro bloco de investimento do plano.
 * - "Feito" = efetivado; "a caminho" = agendado + previsto.
 */

/** A partir de quanto do limite um bloco de gasto entra em alerta. */
export const PLAN_ALERT_RATIO = 0.8;
export const PLAN_MAX_BLOCKS = 8;

// ---------------------------------------------------------------------------
// Modelos prontos
// ---------------------------------------------------------------------------

export interface PlanTemplateBlock {
  name: string;
  kind: PlanBlockKind;
  percent: number;
  color: string;
  /** Nomes das categorias padrão que caem neste bloco. */
  categories?: string[];
  /** Recebe as categorias que não casaram com nenhum outro bloco. */
  rest?: boolean;
}

export interface PlanTemplate {
  key: string;
  name: string;
  description: string;
  blocks: PlanTemplateBlock[];
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    key: '50-30-20',
    name: '50/30/20',
    description: '50% para necessidades, 30% para desejos e 20% para investir.',
    blocks: [
      {
        name: 'Necessidades',
        kind: 'spend',
        percent: 50,
        color: '#0F766E',
        categories: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Pets', 'Impostos e taxas'],
      },
      { name: 'Desejos', kind: 'spend', percent: 30, color: '#DB2777', rest: true },
      { name: 'Investimentos', kind: 'invest', percent: 20, color: '#D97706' },
    ],
  },
  {
    key: '70-20-10',
    name: '70/20/10',
    description: '70% para o custo de vida, 20% para investir e 10% para metas ou dívidas.',
    blocks: [
      { name: 'Custo de vida', kind: 'spend', percent: 70, color: '#0F766E', rest: true },
      { name: 'Investimentos', kind: 'invest', percent: 20, color: '#D97706' },
      { name: 'Metas e dívidas', kind: 'spend', percent: 10, color: '#7C3AED' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Rascunho usado no editor
// ---------------------------------------------------------------------------

export type DraftBlock = Pick<PlanBlock, 'id' | 'name' | 'kind' | 'percent' | 'color'>;

export interface PlanDraft {
  /** Na ordem de exibição. Ids de blocos novos vêm de crypto.randomUUID(). */
  blocks: DraftBlock[];
  /** Categoria de saída de primeiro nível → id do bloco (null = sem bloco). */
  mapping: Record<string, string | null>;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Categorias que podem ter bloco: saídas de primeiro nível não arquivadas. */
export function plannableCategories(categories: Category[]): Category[] {
  return categories.filter((c) => c.kind === 'expense' && !c.parent_id && !c.archived);
}

export function draftFromTemplate(template: PlanTemplate, categories: Category[]): PlanDraft {
  const blocks: DraftBlock[] = template.blocks.map((b) => ({
    id: crypto.randomUUID(),
    name: b.name,
    kind: b.kind,
    percent: b.percent,
    color: b.color,
  }));
  const restIdx = template.blocks.findIndex((b) => b.rest);
  const mapping: PlanDraft['mapping'] = {};
  for (const cat of plannableCategories(categories)) {
    const idx = template.blocks.findIndex((b) => b.categories?.some((n) => norm(n) === norm(cat.name)));
    const i = idx >= 0 ? idx : restIdx;
    mapping[cat.id] = i >= 0 ? blocks[i].id : null;
  }
  return { blocks, mapping };
}

/** Ponto de partida do "Personalizado": um bloco de 100% com todas as categorias. */
export function draftBlank(categories: Category[]): PlanDraft {
  const block: DraftBlock = { id: crypto.randomUUID(), name: 'Gastos do mês', kind: 'spend', percent: 100, color: '#0F766E' };
  const mapping: PlanDraft['mapping'] = {};
  for (const cat of plannableCategories(categories)) mapping[cat.id] = block.id;
  return { blocks: [block], mapping };
}

/** Plano salvo → rascunho para edição. */
export function draftFromPlan(blocks: PlanBlock[], categories: Category[]): PlanDraft {
  const mapping: PlanDraft['mapping'] = {};
  for (const cat of plannableCategories(categories)) mapping[cat.id] = cat.plan_block_id;
  return { blocks: blocks.map(({ id, name, kind, percent, color }) => ({ id, name, kind, percent, color })), mapping };
}

export function draftTotal(draft: PlanDraft): number {
  return draft.blocks.reduce((s, b) => s + (Number.isFinite(b.percent) ? b.percent : 0), 0);
}

/** Problema que impede salvar, ou null. Rascunho sem blocos é válido (remove o plano). */
export function validateDraft(draft: PlanDraft): string | null {
  if (draft.blocks.length === 0) return null;
  if (draft.blocks.length > PLAN_MAX_BLOCKS) return `O plano aceita no máximo ${PLAN_MAX_BLOCKS} blocos.`;
  if (draft.blocks.some((b) => !b.name.trim())) return 'Dê um nome para cada bloco.';
  if (draft.blocks.some((b) => !Number.isInteger(b.percent) || b.percent < 0 || b.percent > 100)) {
    return 'Use percentuais inteiros entre 0 e 100.';
  }
  const total = draftTotal(draft);
  if (total !== 100) return total < 100 ? `Faltam ${100 - total}% para fechar 100%.` : `Passou ${total - 100}% de 100%.`;
  return null;
}

// ---------------------------------------------------------------------------
// Planejado x realizado
// ---------------------------------------------------------------------------

export type BlockLevel = 'ok' | 'warning' | 'over' | 'reached';

export interface BlockCategoryTotal {
  /** Categoria de primeiro nível, ou NO_CATEGORY_ID. */
  categoryId: string;
  done: number;
  upcoming: number;
}

export interface BlockStatus {
  block: PlanBlock;
  /** Valor do bloco no período: renda × percentual. */
  planned: number;
  /** Efetivado no período. */
  done: number;
  /** Agendado + previsto no período. */
  upcoming: number;
  /** done / planned, para barras (0 sem planejado e sem gasto; 1 sem planejado e com gasto). */
  ratio: number;
  /** Gasto: ok | warning (a partir de 80%) | over (passou). Investimento: ok | reached (meta atingida). */
  level: BlockLevel;
  /** Por categoria de primeiro nível, maior primeiro. Aportes por transferência não entram aqui. */
  categories: BlockCategoryTotal[];
}

export interface PlanSummary {
  income: number;
  /** Parte da renda já efetivada. */
  incomeDone: number;
  blocks: BlockStatus[];
  /** Saídas sem bloco (categoria sem bloco ou sem categoria). */
  unassigned: { done: number; upcoming: number; categories: BlockCategoryTotal[] };
  /** Aporte sugerido no período: soma do planejado nos blocos de investimento. */
  suggestedInvest: number;
  /** Já aportado no período: soma do feito nos blocos de investimento. */
  investedDone: number;
}

interface Bucket {
  done: number;
  upcoming: number;
  cats: Map<string, BlockCategoryTotal>;
}

const UNASSIGNED = '__unassigned__';

function sortedCats(b: Bucket | undefined): BlockCategoryTotal[] {
  return b ? [...b.cats.values()].sort((x, y) => y.done + y.upcoming - (x.done + x.upcoming)) : [];
}

/**
 * Planejado x realizado de um período.
 * @param txs lançamentos do período (todos os status)
 * @param accounts contas do grupo (para reconhecer as de investimento)
 */
export function planSummary(
  txs: Transaction[],
  blocks: PlanBlock[],
  categories: Category[],
  accounts: Array<Pick<Account, 'id' | 'type'>>,
  today: ISODate = todayISO(),
): PlanSummary {
  const investAccounts = new Set(accounts.filter((a) => a.type === 'investment').map((a) => a.id));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const blockIds = new Set(blocks.map((b) => b.id));
  const firstInvest = blocks.find((b) => b.kind === 'invest')?.id ?? null;
  const buckets = new Map<string, Bucket>();
  const bucket = (key: string): Bucket => {
    let b = buckets.get(key);
    if (!b) {
      b = { done: 0, upcoming: 0, cats: new Map() };
      buckets.set(key, b);
    }
    return b;
  };

  let income = 0;
  let incomeDone = 0;

  for (const tx of txs) {
    const amount = tx.amount_cents;
    const effective = isEffective(tx, today);

    if (tx.type === 'income') {
      if (investAccounts.has(tx.account_id)) continue;
      income += amount;
      if (effective) incomeDone += amount;
      continue;
    }

    if (tx.type === 'expense') {
      const cat = tx.category_id ? catById.get(tx.category_id) : undefined;
      const top = cat?.parent_id ? catById.get(cat.parent_id) : cat;
      const blockId = top?.plan_block_id && blockIds.has(top.plan_block_id) ? top.plan_block_id : null;
      const b = bucket(blockId ?? UNASSIGNED);
      const catKey = top?.id ?? NO_CATEGORY_ID;
      let c = b.cats.get(catKey);
      if (!c) {
        c = { categoryId: catKey, done: 0, upcoming: 0 };
        b.cats.set(catKey, c);
      }
      if (effective) {
        b.done += amount;
        c.done += amount;
      } else {
        b.upcoming += amount;
        c.upcoming += amount;
      }
      continue;
    }

    // Transferência: só interessa a aporte (entra em investimento) ou resgate (sai de investimento).
    if (!firstInvest || !tx.to_account_id) continue;
    const fromInvest = investAccounts.has(tx.account_id);
    const toInvest = investAccounts.has(tx.to_account_id);
    if (fromInvest === toInvest) continue;
    const signed = toInvest ? amount : -amount;
    const b = bucket(firstInvest);
    if (effective) b.done += signed;
    else b.upcoming += signed;
  }

  const statuses: BlockStatus[] = blocks.map((block) => {
    const b = buckets.get(block.id);
    const planned = Math.round((income * block.percent) / 100);
    const done = Math.max(0, b?.done ?? 0);
    const upcoming = Math.max(0, b?.upcoming ?? 0);
    const ratio = planned > 0 ? done / planned : done > 0 ? 1 : 0;
    let level: BlockLevel = 'ok';
    if (block.kind === 'spend') {
      if (done > planned) level = 'over';
      else if (planned > 0 && done >= planned * PLAN_ALERT_RATIO) level = 'warning';
    } else if (planned > 0 && done >= planned) {
      level = 'reached';
    }
    return { block, planned, done, upcoming, ratio, level, categories: sortedCats(b) };
  });

  const un = buckets.get(UNASSIGNED);
  const invest = statuses.filter((s) => s.block.kind === 'invest');
  return {
    income,
    incomeDone,
    blocks: statuses,
    unassigned: { done: un?.done ?? 0, upcoming: un?.upcoming ?? 0, categories: sortedCats(un) },
    suggestedInvest: invest.reduce((s, x) => s + x.planned, 0),
    investedDone: invest.reduce((s, x) => s + x.done, 0),
  };
}

/** Blocos de gasto em alerta (a partir de 80%) ou estourados, piores primeiro. Vazio sem renda no período. */
export function planAlerts(summary: PlanSummary): BlockStatus[] {
  if (summary.income <= 0) return [];
  return summary.blocks
    .filter((s) => s.level === 'warning' || s.level === 'over')
    .sort((a, b) => b.ratio - a.ratio);
}
