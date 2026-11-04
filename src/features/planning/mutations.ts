import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PlanDraft } from './plan';

/**
 * Salva o plano inteiro pela RPC save_plan: blocos (somando 100%) e o bloco de cada categoria.
 * Rascunho sem blocos remove o plano. Valide antes com validateDraft().
 */
export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, draft }: { groupId: string; draft: PlanDraft }): Promise<void> => {
      const blocks = draft.blocks.map((b) => ({
        id: b.id,
        name: b.name.trim(),
        kind: b.kind,
        percent: b.percent,
        color: b.color,
      }));
      const ids = new Set(blocks.map((b) => b.id));
      const categories = Object.entries(draft.mapping).map(([category_id, block_id]) => ({
        category_id,
        block_id: block_id && ids.has(block_id) ? block_id : null,
      }));
      const { error } = await supabase.rpc('save_plan', {
        p_group: groupId,
        p_blocks: blocks,
        p_categories: categories,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['plan-blocks'] }),
        qc.invalidateQueries({ queryKey: ['categories'] }),
      ]),
  });
}
