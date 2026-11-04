import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, PiggyBank } from 'lucide-react';
import { useAccounts, useCategories, usePlanBlocks, useTransactions } from '@/hooks/queries';
import { PeriodSwitcher, usePeriodParam } from '@/components/PeriodSwitcher';
import { Button, Card, CardHeader, ColorDot, EmptyState, Money, PageHeader, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { CategoryIcon } from '@/lib/icons';
import { NO_CATEGORY_ID } from '@/features/dashboard/aggregate';
import { PlanBar } from '@/features/planning/PlanBar';
import { PlanEditor } from '@/features/planning/PlanEditor';
import {
  PLAN_TEMPLATES,
  draftBlank,
  draftFromPlan,
  draftFromTemplate,
  planSummary,
  type BlockCategoryTotal,
  type BlockStatus,
  type PlanDraft,
} from '@/features/planning/plan';

function levelText(level: BlockStatus['level']): string {
  if (level === 'over') return 'text-expense';
  if (level === 'warning') return 'text-amber-600 dark:text-amber-400';
  if (level === 'reached') return 'text-income';
  return 'text-muted';
}

export default function Planning() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = usePeriodParam();
  const blocksQ = usePlanBlocks();
  const catsQ = useCategories();
  const accountsQ = useAccounts();
  const txQ = useTransactions({ from: period.start, to: period.end });

  const blocks = useMemo(() => blocksQ.data ?? [], [blocksQ.data]);
  const categories = useMemo(() => catsQ.data ?? [], [catsQ.data]);
  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const txs = useMemo(() => txQ.data ?? [], [txQ.data]);
  const hasPlan = blocks.length > 0;

  const summary = useMemo(() => planSummary(txs, blocks, categories, accounts), [txs, blocks, categories, accounts]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const [editorDraft, setEditorDraft] = useState<PlanDraft | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  const loading = blocksQ.isLoading || catsQ.isLoading || accountsQ.isLoading || txQ.isLoading;
  const error = blocksQ.error ?? catsQ.error ?? accountsQ.error ?? txQ.error;

  const openEditor = (draft?: PlanDraft) =>
    setEditorDraft(
      draft ?? (hasPlan ? draftFromPlan(blocks, categories) : draftFromTemplate(PLAN_TEMPLATES[0], categories)),
    );

  const closeEditor = () => {
    setEditorDraft(null);
    if (params.has('editar')) {
      const next = new URLSearchParams(params);
      next.delete('editar');
      setParams(next, { replace: true });
    }
  };

  const wantsEdit = params.get('editar') === '1';
  useEffect(() => {
    if (wantsEdit && !loading && !error && editorDraft === null) openEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsEdit, loading, error]);

  const openCategory = (id: string) => {
    if (id === NO_CATEGORY_ID) return;
    navigate(`/extrato?periodo=${period.key}&categoria=${id}&tipo=expense`);
  };

  const CategoryRows = ({ items }: { items: BlockCategoryTotal[] }) => (
    <ul className="mt-3 flex flex-col border-t border-line pt-1">
      {items.map((c) => {
        const cat = catById.get(c.categoryId);
        const linkable = c.categoryId !== NO_CATEGORY_ID;
        return (
          <li key={c.categoryId}>
            <button
              type="button"
              disabled={!linkable}
              onClick={() => openCategory(c.categoryId)}
              className="flex min-h-11 w-full items-center gap-3 text-left"
            >
              <CategoryIcon name={cat?.icon} color={cat?.color} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm">{cat?.name ?? 'Sem categoria'}</span>
              <span className="shrink-0 text-right text-sm">
                <Money cents={c.done} />
                {c.upcoming > 0 && (
                  <span className="block text-xs text-muted">
                    + <Money cents={c.upcoming} />
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const unassignedTotal = summary.unassigned.done + summary.unassigned.upcoming;

  return (
    <div className="pb-6">
      <PageHeader
        title="Planejamento"
        back
        actions={
          hasPlan ? (
            <Button variant="ghost" size="sm" onClick={() => openEditor()}>
              Editar
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4">
        <PeriodSwitcher period={period} onChange={setPeriod} />

        {error ? (
          <Card>
            <EmptyState title="Não foi possível carregar" description={errorMessage(error)} />
          </Card>
        ) : loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : !hasPlan ? (
          <>
            <p className="px-1 text-sm text-muted">
              Divida a renda do mês em blocos (necessidades, desejos, investimentos) e acompanhe quanto já usou de cada um.
            </p>
            {PLAN_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => openEditor(draftFromTemplate(t, categories))}
                className="rounded-2xl border border-line bg-surface p-4 text-left shadow-sm"
              >
                <p className="font-semibold">{t.name}</p>
                <p className="mt-1 text-sm text-muted">{t.description}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => openEditor(draftBlank(categories))}
              className="rounded-2xl border border-line bg-surface p-4 text-left shadow-sm"
            >
              <p className="font-semibold">Personalizado</p>
              <p className="mt-1 text-sm text-muted">Monte seus próprios blocos e percentuais.</p>
            </button>
          </>
        ) : summary.income === 0 ? (
          <Card>
            <EmptyState
              icon={<PiggyBank size={32} />}
              title="Sem renda neste período"
              description="Registre uma entrada ou preveja a renda, por exemplo com uma recorrência de salário."
              action={
                <Button variant="secondary" onClick={() => navigate('/recorrencias?nova=1')}>
                  Prever renda
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader title="Renda do período" />
              <p className="text-2xl font-bold">
                <Money cents={summary.income} />
              </p>
              <p className="mt-1 text-sm text-muted">
                Já recebido: <Money cents={summary.incomeDone} />
              </p>
              {blocks.some((b) => b.kind === 'invest') && (
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Aporte sugerido</dt>
                    <dd className="font-semibold">
                      <Money cents={summary.suggestedInvest} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Já aportado</dt>
                    <dd className="font-semibold">
                      <Money cents={summary.investedDone} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Falta</dt>
                    <dd className="font-semibold">
                      <Money cents={Math.max(0, summary.suggestedInvest - summary.investedDone)} />
                    </dd>
                  </div>
                  <p className="col-span-3 text-xs text-muted">
                    Em 12 meses, mantendo o plano: <Money cents={summary.suggestedInvest * 12} />
                  </p>
                </dl>
              )}
            </Card>

            {summary.blocks.map((s) => {
              const invest = s.block.kind === 'invest';
              const open = opened === s.block.id;
              const diff = s.planned - s.done;
              return (
                <Card key={s.block.id}>
                  <div className="flex items-center gap-2">
                    <ColorDot color={s.block.color} />
                    <h3 className="min-w-0 flex-1 truncate font-semibold">{s.block.name}</h3>
                    <span className="text-sm text-muted">{s.block.percent}%</span>
                    <span className="text-sm font-semibold">
                      <Money cents={s.planned} />
                    </span>
                  </div>
                  <div className="mt-3">
                    <PlanBar status={s} />
                  </div>
                  <p className="mt-2 text-sm">
                    {invest ? 'Aportado ' : ''}
                    <Money cents={s.done} /> de <Money cents={s.planned} />
                  </p>
                  <p className={`text-xs ${levelText(s.level)}`}>
                    {invest ? (
                      s.level === 'reached' ? (
                        'Meta do mês atingida'
                      ) : (
                        <>
                          Falta <Money cents={Math.max(0, diff)} />
                        </>
                      )
                    ) : diff < 0 ? (
                      <>
                        Passou <Money cents={-diff} />
                      </>
                    ) : (
                      <>
                        Disponível <Money cents={diff} />
                      </>
                    )}
                  </p>
                  {s.upcoming > 0 && (
                    <p className="text-xs text-muted">
                      + <Money cents={s.upcoming} /> a caminho
                    </p>
                  )}
                  {s.categories.length > 0 && (
                    <>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpened(open ? null : s.block.id)}
                        className="mt-1 flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-300"
                      >
                        Categorias ({s.categories.length})
                        <ChevronDown size={16} className={open ? 'rotate-180' : ''} />
                      </button>
                      {open && <CategoryRows items={s.categories} />}
                    </>
                  )}
                </Card>
              );
            })}

            {unassignedTotal > 0 && (
              <Card>
                <CardHeader title="Fora do plano" />
                <p className="text-sm">
                  <Money cents={summary.unassigned.done} /> feito
                  {summary.unassigned.upcoming > 0 && (
                    <>
                      {' '}
                      + <Money cents={summary.unassigned.upcoming} /> a caminho
                    </>
                  )}
                </p>
                <CategoryRows items={summary.unassigned.categories} />
                <Button variant="secondary" className="mt-3" onClick={() => openEditor()}>
                  Ligar categorias
                </Button>
              </Card>
            )}
          </>
        )}
      </div>

      {editorDraft && (
        <PlanEditor open initial={editorDraft} hasPlan={hasPlan} categories={categories} onClose={closeEditor} />
      )}
    </div>
  );
}
