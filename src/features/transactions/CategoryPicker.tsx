import { Link } from 'react-router-dom';
import { buildCategoryTree } from '@/lib/categories';
import { CategoryIcon } from '@/lib/icons';
import type { Category, CategoryKind } from '@/types';

/** Grade de categorias principais + chips de subcategoria da escolhida. */
export function CategoryPicker({
  categories,
  kind,
  parentId,
  subId,
  onPick,
  onManage,
  error,
}: {
  categories: Category[];
  kind: CategoryKind;
  parentId: string | null;
  subId: string | null;
  onPick: (parentId: string, subId: string | null) => void;
  onManage: () => void;
  error?: string;
}) {
  const tree = buildCategoryTree(categories, kind);
  const selected = tree.find((c) => c.id === parentId);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium">Categoria</span>
        <Link
          to="/categorias"
          onClick={(e) => {
            e.preventDefault();
            onManage();
          }}
          className="inline-flex min-h-11 items-center text-xs font-medium text-brand-700 dark:text-brand-300"
        >
          Gerenciar
        </Link>
      </div>
      {tree.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Nenhuma categoria cadastrada. Toque em Gerenciar.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {tree.map((c) => {
            const isSel = c.id === parentId;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={isSel}
                onClick={() => onPick(c.id, null)}
                className={`flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 transition ${
                  isSel ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/30 dark:bg-brand-600/20' : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <CategoryIcon name={c.icon} color={c.color} size={36} />
                <span className="w-full truncate text-center text-[11px] font-medium leading-tight">{c.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {selected && selected.children.length > 0 && (
        <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
          {selected.children.map((s) => {
            const isSel = s.id === subId;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={isSel}
                onClick={() => onPick(selected.id, isSel ? null : s.id)}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition ${
                  isSel ? 'border-brand-600 bg-brand-50 font-medium text-brand-800 dark:bg-brand-600/20 dark:text-brand-50' : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-expense">{error}</p>}
    </div>
  );
}
