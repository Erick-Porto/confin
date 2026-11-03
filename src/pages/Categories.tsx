import { useMemo, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import { useCategories } from '@/hooks/queries';
import { buildCategoryTree } from '@/lib/categories';
import { CategoryIcon } from '@/lib/icons';
import { CategoryForm } from '@/features/categories/CategoryForm';
import {
  Button,
  Card,
  EmptyState,
  ListItem,
  Money,
  PageHeader,
  Segmented,
  Skeleton,
  Switch,
} from '@/components/ui';
import type { Category, CategoryKind } from '@/types';

export default function Categories() {
  const q = useCategories();
  const categories = useMemo(() => q.data ?? [], [q.data]);
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const tree = useMemo(() => buildCategoryTree(categories, kind, showArchived), [categories, kind, showArchived]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setFormOpen(true);
  }

  function row(c: Category, child: boolean) {
    const budget = kind === 'expense' && c.monthly_budget_cents ? Number(c.monthly_budget_cents) : null;
    return (
      <div key={c.id} className={child ? 'pl-8' : ''}>
        <ListItem
          onClick={() => openEdit(c)}
          leading={<CategoryIcon name={c.icon} color={c.color} size={child ? 32 : 40} />}
          title={
            <span className={c.archived ? 'text-muted' : ''}>
              {c.name}
              {c.archived && ' (arquivada)'}
            </span>
          }
          subtitle={
            budget ? (
              <span>
                Orçamento <Money cents={budget} />/mês
              </span>
            ) : undefined
          }
        />
      </div>
    );
  }

  const header = (
    <PageHeader
      title="Categorias"
      back="/mais"
      actions={
        <Button size="sm" icon={<Plus size={16} />} onClick={openNew}>
          Nova
        </Button>
      }
    />
  );

  if (q.isLoading) {
    return (
      <div>
        {header}
        <Skeleton className="h-10" />
        <Skeleton className="mt-4 h-64" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div>
        {header}
        <EmptyState
          title="Não foi possível carregar as categorias"
          description="Verifique sua conexão e tente de novo."
          action={<Button onClick={() => void q.refetch()}>Tentar de novo</Button>}
        />
      </div>
    );
  }

  return (
    <div className="pb-6">
      {header}
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: 'Saídas' },
          { value: 'income', label: 'Entradas' },
        ]}
      />

      <Card className="mt-4 py-2">
        {tree.length === 0 ? (
          <EmptyState
            icon={<Tag size={36} />}
            title="Nenhuma categoria"
            description={kind === 'expense' ? 'Crie categorias para organizar suas saídas.' : 'Crie categorias para organizar suas entradas.'}
            action={<Button onClick={openNew}>Nova categoria</Button>}
          />
        ) : (
          <div className="divide-y divide-line">
            {tree.map((p) => (
              <div key={p.id} className="py-1">
                {row(p, false)}
                {p.children.map((c) => row(c, true))}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-3 px-1">
        <Switch checked={showArchived} onChange={setShowArchived} label="Mostrar arquivadas" />
      </div>

      {formOpen && (
        <CategoryForm
          key={editing?.id ?? 'new'}
          category={editing}
          defaultKind={kind}
          categories={categories}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
