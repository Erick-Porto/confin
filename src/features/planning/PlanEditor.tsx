import { useState } from 'react';
import { Plus, Trash } from 'lucide-react';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { Button, ConfirmDialog, Input, Segmented, Select, Sheet } from '@/components/ui';
import { CategoryIcon, COLOR_OPTIONS } from '@/lib/icons';
import { errorMessage } from '@/lib/errors';
import type { Category, PlanBlockKind } from '@/types';
import {
  PLAN_MAX_BLOCKS,
  PLAN_TEMPLATES,
  draftBlank,
  draftFromTemplate,
  draftTotal,
  plannableCategories,
  validateDraft,
  type DraftBlock,
  type PlanDraft,
} from './plan';
import { useSavePlan } from './mutations';

export function PlanEditor({
  open,
  initial,
  hasPlan,
  categories,
  onClose,
}: {
  open: boolean;
  initial: PlanDraft;
  hasPlan: boolean;
  categories: Category[];
  onClose: () => void;
}) {
  const groupId = useGroupId();
  const { toast } = useUI();
  const save = useSavePlan();
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const cats = plannableCategories(categories);
  const problem = validateDraft(draft);
  const total = draftTotal(draft);

  const patchBlock = (id: string, patch: Partial<DraftBlock>) =>
    setDraft((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));

  const addBlock = () =>
    setDraft((d) => ({
      ...d,
      blocks: [
        ...d.blocks,
        {
          id: crypto.randomUUID(),
          name: '',
          kind: 'spend',
          percent: Math.max(0, 100 - draftTotal(d)),
          color: COLOR_OPTIONS[d.blocks.length % COLOR_OPTIONS.length],
        },
      ],
    }));

  const removeBlock = (id: string) =>
    setDraft((d) => ({
      blocks: d.blocks.filter((b) => b.id !== id),
      mapping: Object.fromEntries(Object.entries(d.mapping).map(([k, v]) => [k, v === id ? null : v])),
    }));

  const persist = async (next: PlanDraft, okMsg: string) => {
    try {
      await save.mutateAsync({ groupId, draft: next });
      toast(okMsg);
      setConfirmRemove(false);
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  };

  const removePlan = () =>
    persist({ blocks: [], mapping: Object.fromEntries(Object.keys(draft.mapping).map((k) => [k, null])) }, 'Plano removido');

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Plano do mês"
        size="lg"
        footer={
          <div className="flex flex-col gap-2">
            <Button
              disabled={problem !== null || save.isPending || draft.blocks.length === 0}
              loading={save.isPending}
              onClick={() => persist(draft, 'Plano salvo')}
            >
              Salvar
            </Button>
            {hasPlan && (
              <Button variant="ghost" className="text-expense!" onClick={() => setConfirmRemove(true)}>
                Remover plano
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted">Começar de um modelo</h3>
            <div className="flex flex-wrap gap-2">
              {PLAN_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setDraft(draftFromTemplate(t, categories))}
                  className="min-h-11 rounded-full border border-line px-4 text-sm font-medium"
                >
                  {t.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDraft(draftBlank(categories))}
                className="min-h-11 rounded-full border border-line px-4 text-sm font-medium"
              >
                Personalizado
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-muted">Blocos</h3>
            {draft.blocks.map((b) => (
              <div key={b.id} className="flex flex-col gap-3 rounded-xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Nome do bloco"
                    placeholder="Nome do bloco"
                    maxLength={40}
                    value={b.name}
                    onChange={(e) => patchBlock(b.id, { name: e.target.value })}
                  />
                  <div className="relative w-24 shrink-0">
                    <Input
                      aria-label="Percentual"
                      inputMode="numeric"
                      className="pr-7 text-right"
                      value={Number.isFinite(b.percent) ? String(b.percent) : ''}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                        patchBlock(b.id, { percent: digits === '' ? NaN : Number(digits) });
                      }}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Remover bloco"
                    onClick={() => removeBlock(b.id)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-expense"
                  >
                    <Trash size={18} />
                  </button>
                </div>
                <Segmented<PlanBlockKind>
                  value={b.kind}
                  onChange={(kind) => patchBlock(b.id, { kind })}
                  options={[
                    { value: 'spend', label: 'Gasto' },
                    { value: 'invest', label: 'Investimento' },
                  ]}
                />
                <div className="flex flex-wrap gap-0.5">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Cor ${c}`}
                      onClick={() => patchBlock(b.id, { color: c })}
                      className="flex size-11 items-center justify-center"
                    >
                      <span
                        className={`size-5 rounded-full ${b.color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button variant="secondary" disabled={draft.blocks.length >= PLAN_MAX_BLOCKS} onClick={addBlock}>
              <Plus size={18} /> Adicionar bloco
            </Button>
            <p className="text-sm">
              <span className="font-semibold">Total: {Number.isFinite(total) ? total : 0}%</span>{' '}
              <span className={problem ? 'text-expense' : 'text-income'}>{problem ?? 'Fecha 100% da renda'}</span>
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted">Categorias</h3>
            <p className="text-xs text-muted">Subcategorias seguem a categoria principal.</p>
            {cats.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <CategoryIcon name={c.icon} color={c.color} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                <Select
                  aria-label={`Bloco de ${c.name}`}
                  className="w-44 shrink-0"
                  value={draft.mapping[c.id] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, mapping: { ...d.mapping, [c.id]: e.target.value || null } }))}
                >
                  <option value="">Sem bloco</option>
                  {draft.blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name.trim() || 'Bloco sem nome'}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </section>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirmRemove}
        title="Remover plano?"
        message="Os blocos serão apagados. Lançamentos e categorias não mudam."
        confirmLabel="Remover"
        loading={save.isPending}
        onConfirm={removePlan}
        onCancel={() => setConfirmRemove(false)}
      />
    </>
  );
}
