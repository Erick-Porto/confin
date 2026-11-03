import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { centsToInput, parseAmountToCents } from '@/lib/format';
import { CATEGORY_ICON_NAMES, COLOR_OPTIONS, CategoryIcon } from '@/lib/icons';
import { ColorSwatches } from '@/features/accounts/AccountForm';
import { Button, ConfirmDialog, Field, Input, Segmented, Select, Sheet, Switch } from '@/components/ui';
import type { Category, CategoryKind } from '@/types';

/** Folha de cadastro/edição de categoria. Monte só quando for abrir (o estado inicia do zero). */
export function CategoryForm({
  category,
  defaultKind,
  categories,
  onClose,
}: {
  category: Category | null;
  defaultKind: CategoryKind;
  categories: Category[];
  onClose: () => void;
}) {
  const groupId = useGroupId();
  const { toast } = useUI();
  const qc = useQueryClient();
  const editing = !!category;

  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? defaultKind);
  const [parentId, setParentId] = useState(category?.parent_id ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'tag');
  const [color, setColor] = useState(category?.color ?? COLOR_OPTIONS[0]);
  const [budget, setBudget] = useState(
    category?.monthly_budget_cents != null ? centsToInput(Number(category.monthly_budget_cents)) : '',
  );
  const [archived, setArchived] = useState(category?.archived ?? false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasChildren = !!category && categories.some((c) => c.parent_id === category.id);
  const parentOptions = categories.filter(
    (c) => !c.parent_id && c.kind === kind && c.id !== category?.id && (!c.archived || c.id === category?.parent_id),
  );

  const parsedBudget = budget.trim() ? parseAmountToCents(budget) : null;
  const errors = {
    name: name.trim() ? '' : 'Informe o nome da categoria.',
    budget: kind === 'expense' && budget.trim() && (parsedBudget === null || parsedBudget <= 0) ? 'Valor inválido.' : '',
  };
  const invalid = Object.values(errors).some(Boolean);

  async function refreshCategories() {
    await qc.invalidateQueries({ queryKey: ['categories'] });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (invalid || saving) return;
    const payload = {
      group_id: groupId,
      name: name.trim(),
      kind,
      parent_id: parentId || null,
      icon,
      color,
      monthly_budget_cents: kind === 'expense' ? parsedBudget : null,
      archived,
    };
    setSaving(true);
    try {
      const res = category
        ? await supabase.from('categories').update(payload).eq('id', category.id)
        : await supabase.from('categories').insert(payload);
      if (res.error) throw res.error;
      await refreshCategories();
      toast(category ? 'Categoria atualizada' : 'Categoria criada');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!category) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('categories').delete().eq('id', category.id);
      if (error) throw error;
      await refreshCategories();
      await qc.invalidateQueries({ queryKey: ['transactions'] });
      toast('Categoria excluída');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={editing ? 'Editar categoria' : 'Nova categoria'}
        footer={
          <Button type="submit" form="category-form" block loading={saving}>
            Salvar
          </Button>
        }
      >
        <form id="category-form" onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Nome" error={submitted ? errors.name : ''}>
            {(id) => (
              <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mercado" maxLength={40} />
            )}
          </Field>
          {!editing && (
            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Tipo</span>
              <Segmented
                value={kind}
                onChange={(k) => {
                  setKind(k);
                  setParentId('');
                }}
                options={[
                  { value: 'expense', label: 'Saída' },
                  { value: 'income', label: 'Entrada' },
                ]}
              />
            </div>
          )}
          <Field
            label="Categoria pai"
            hint={hasChildren ? 'Esta categoria tem subcategorias, então não pode virar subcategoria.' : undefined}
          >
            {(id) => (
              <Select id={id} value={parentId} disabled={hasChildren} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Nenhuma (principal)</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Ícone</span>
            <div className="grid max-h-56 grid-cols-6 gap-2 overflow-y-auto rounded-xl border border-line p-2">
              {CATEGORY_ICON_NAMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={n}
                  aria-pressed={icon === n}
                  onClick={() => setIcon(n)}
                  className={`flex h-11 items-center justify-center rounded-xl transition hover:bg-surface-2 ${
                    icon === n ? 'bg-surface-2 ring-2 ring-brand-600' : ''
                  }`}
                >
                  <CategoryIcon name={n} color={color} size={32} />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Cor</span>
            <ColorSwatches value={color} onChange={setColor} />
          </div>
          {kind === 'expense' && (
            <Field
              label="Orçamento mensal (opcional)"
              hint="Você recebe um alerta no painel ao passar de 80%"
              error={submitted ? errors.budget : ''}
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="0,00"
                />
              )}
            </Field>
          )}
          {editing && (
            <div className="space-y-2 border-t border-line pt-3">
              <Switch
                checked={archived}
                onChange={setArchived}
                label="Arquivada"
                description="Some das opções de novos lançamentos, mas o histórico fica."
              />
              <Button variant="ghost" block className="text-expense!" onClick={() => setConfirmDelete(true)}>
                Excluir categoria
              </Button>
            </div>
          )}
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir categoria?"
        message="Os lançamentos desta categoria ficam sem categoria. Prefira arquivar."
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
