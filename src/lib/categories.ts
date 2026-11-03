import type { Category, CategoryKind } from '@/types';

export interface CategoryNode extends Category {
  children: Category[];
}

function byOrder(a: Category, b: Category): number {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR');
}

/** Árvore de um nível: categorias principais com as subcategorias dentro. */
export function buildCategoryTree(categories: Category[], kind?: CategoryKind, includeArchived = false): CategoryNode[] {
  const visible = categories.filter((c) => (kind ? c.kind === kind : true) && (includeArchived || !c.archived));
  const parents = visible.filter((c) => !c.parent_id).sort(byOrder);
  return parents.map((p) => ({
    ...p,
    children: visible.filter((c) => c.parent_id === p.id).sort(byOrder),
  }));
}

/** Id da categoria principal (a própria, se não tiver pai). Usado para somar subcategorias no pai. */
export function topLevelId(categoryId: string, categories: Category[]): string {
  const cat = categories.find((c) => c.id === categoryId);
  return cat?.parent_id ?? categoryId;
}

/** A categoria e todas as subcategorias dela (para filtrar o extrato por categoria). */
export function categoryWithChildrenIds(categoryId: string, categories: Category[]): string[] {
  return [categoryId, ...categories.filter((c) => c.parent_id === categoryId).map((c) => c.id)];
}

/** "Alimentação › Mercado". */
export function categoryPath(categoryId: string | null, categories: Category[]): string {
  if (!categoryId) return 'Sem categoria';
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return 'Sem categoria';
  const parent = cat.parent_id ? categories.find((c) => c.id === cat.parent_id) : undefined;
  return parent ? `${parent.name} › ${cat.name}` : cat.name;
}
