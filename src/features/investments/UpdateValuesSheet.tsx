import { useMemo, useState } from 'react';
import { useInvestmentFlows, useInvestmentValues, useInvestments } from '@/hooks/queries';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { Button, Field, Input, Money, Sheet } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { todayISO } from '@/lib/format';
import type { InvestmentValue } from '@/types';
import { MoneyField } from './MoneyField';
import { useDeleteInvestmentValue, useSaveInvestmentValues } from './mutations';
import { positionAt } from './portfolio';

/**
 * Informa o valor de mercado das aplicações numa data.
 * `only` restringe a certas aplicações; `editing` edita (e permite excluir) um valor já informado.
 */
export function UpdateValuesSheet({
  only,
  editing,
  onClose,
}: {
  only?: string[];
  editing?: InvestmentValue;
  onClose: () => void;
}) {
  const groupId = useGroupId();
  const { toast } = useUI();
  const invQ = useInvestments();
  const valuesQ = useInvestmentValues();
  const flowsQ = useInvestmentFlows();
  const save = useSaveInvestmentValues();
  const remove = useDeleteInvestmentValue();

  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [amounts, setAmounts] = useState<Record<string, number>>(
    editing ? { [editing.investment_id]: editing.value_cents } : {},
  );

  const rows = useMemo(() => {
    const ids = editing ? [editing.investment_id] : only;
    return (invQ.data ?? []).filter((i) => (ids ? ids.includes(i.id) : !i.archived));
  }, [invQ.data, only, editing]);

  const values = valuesQ.data ?? [];
  const flows = flowsQ.data ?? [];

  async function submit() {
    const filled = rows
      .filter((i) => (amounts[i.id] ?? 0) > 0)
      .map((i) => ({ group_id: groupId, investment_id: i.id, date, value_cents: amounts[i.id] }));
    if (filled.length === 0) return toast('Informe ao menos um valor.', { tone: 'error' });
    try {
      await save.mutateAsync(filled);
      toast('Valores atualizados');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  async function del() {
    if (!editing) return;
    try {
      await remove.mutateAsync(editing.id);
      toast('Valor excluído');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Editar valor' : 'Atualizar valores'}
      footer={
        <div className="flex gap-2">
          {editing && (
            <Button variant="outline" loading={remove.isPending} onClick={() => void del()}>
              Excluir
            </Button>
          )}
          <Button block loading={save.isPending} onClick={() => void submit()}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <Field label="Data" hint="Um valor por dia: salvar de novo na mesma data substitui.">
          {(id) => <Input id={id} type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value || todayISO())} />}
        </Field>
        {rows.length === 0 && <p className="text-sm text-muted">Nenhuma aplicação ativa.</p>}
        {rows.map((inv) => {
          const pos = positionAt(inv, values, flows);
          return (
            <Field
              key={inv.id}
              label={inv.name}
              hint={pos ? <>Estimado hoje: <Money cents={pos.value} /></> : undefined}
            >
              {(id) => (
                <MoneyField
                  id={id}
                  placeholder="Sem alteração"
                  cents={amounts[inv.id] ?? 0}
                  onChange={(c) => setAmounts((a) => ({ ...a, [inv.id]: c }))}
                />
              )}
            </Field>
          );
        })}
      </div>
    </Sheet>
  );
}
