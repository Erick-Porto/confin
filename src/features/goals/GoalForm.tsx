import { useMemo, useState } from 'react';
import { useAccounts, useInvestments, useMembers } from '@/hooks/queries';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { Button, ConfirmDialog, Field, Input, Segmented, Select, Sheet, Switch } from '@/components/ui';
import { accountLabel, isCreditCard } from '@/lib/accounts';
import { errorMessage } from '@/lib/errors';
import { COLOR_OPTIONS } from '@/lib/icons';
import { MoneyField } from '@/features/investments/MoneyField';
import type { Goal, GoalKind } from '@/types';
import { useDeleteGoal, useSaveGoal } from './goals';

/** Cadastro e edição de meta. */
export function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const groupId = useGroupId();
  const { toast } = useUI();
  const { data: accounts = [] } = useAccounts();
  const { data: investments = [] } = useInvestments();
  const { data: members = [] } = useMembers();
  const save = useSaveGoal();
  const remove = useDeleteGoal();

  const accountOptions = useMemo(
    () => accounts.filter((a) => !isCreditCard(a) && (!a.archived || a.id === goal?.account_id)),
    [accounts, goal],
  );
  const investmentOptions = useMemo(
    () => investments.filter((i) => !i.archived || i.id === goal?.investment_id),
    [investments, goal],
  );

  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal?.target_cents ?? 0);
  const [date, setDate] = useState(goal?.target_date ?? '');
  const [color, setColor] = useState(goal?.color ?? COLOR_OPTIONS[0]);
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'manual');
  const [saved, setSaved] = useState(goal?.saved_cents ?? 0);
  const [accountId, setAccountId] = useState(goal?.account_id ?? '');
  const [investmentId, setInvestmentId] = useState(goal?.investment_id ?? '');
  const [archived, setArchived] = useState(goal?.archived ?? false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const effAccount = accountId || accountOptions[0]?.id || '';
  const effInvestment = investmentId || investmentOptions[0]?.id || '';

  async function submit() {
    if (!name.trim()) return setError('Informe o nome da meta.');
    if (target <= 0) return setError('Informe o valor da meta.');
    if (kind === 'account' && !effAccount) return setError('Escolha a conta.');
    if (kind === 'investment' && !effInvestment) return setError('Escolha a aplicação.');
    setError(null);
    try {
      await save.mutateAsync({
        id: goal?.id,
        input: {
          group_id: groupId,
          name: name.trim(),
          kind,
          target_cents: target,
          target_date: date || null,
          saved_cents: kind === 'manual' ? saved : 0,
          account_id: kind === 'account' ? effAccount : null,
          investment_id: kind === 'investment' ? effInvestment : null,
          color,
          archived,
        },
      });
      toast(goal ? 'Meta atualizada' : 'Meta criada');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  async function doDelete() {
    if (!goal) return;
    try {
      await remove.mutateAsync(goal.id);
      toast('Meta excluída');
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={goal ? 'Editar meta' : 'Nova meta'}
        footer={
          <div className="flex flex-col gap-2">
            <Button loading={save.isPending} onClick={submit}>
              Salvar
            </Button>
            {goal && (
              <Button variant="ghost" className="text-expense!" onClick={() => setConfirmDelete(true)}>
                Excluir meta
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-2">
          <Field label="Nome" error={error && !name.trim() ? error : undefined}>
            {(id) => (
              <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reserva de emergência" />
            )}
          </Field>
          <Field label="Valor da meta" error={error && name.trim() && target <= 0 ? error : undefined}>
            {(id) => <MoneyField id={id} cents={target} onChange={setTarget} placeholder="R$ 0,00" />}
          </Field>
          <Field label="Prazo (opcional)">
            {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium">Cor</p>
            <div className="flex flex-wrap gap-0.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  onClick={() => setColor(c)}
                  className="flex size-11 items-center justify-center"
                >
                  <span
                    className={`size-5 rounded-full ${color === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Como acompanhar</p>
            <Segmented<GoalKind>
              value={kind}
              onChange={setKind}
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'account', label: 'Conta' },
                { value: 'investment', label: 'Aplicação' },
              ]}
            />
          </div>
          {kind === 'manual' && (
            <Field label="Já guardado">
              {(id) => <MoneyField id={id} cents={saved} onChange={setSaved} placeholder="R$ 0,00" />}
            </Field>
          )}
          {kind === 'account' && (
            <Field label="Conta" hint="O progresso é o saldo da conta." error={error && !effAccount ? error : undefined}>
              {(id) => (
                <Select id={id} value={effAccount} onChange={(e) => setAccountId(e.target.value)}>
                  {accountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a, members)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {kind === 'investment' && (
            <Field label="Aplicação" hint="O progresso é o valor de mercado da aplicação." error={error && !effInvestment ? error : undefined}>
              {(id) => (
                <Select id={id} value={effInvestment} onChange={(e) => setInvestmentId(e.target.value)}>
                  {investmentOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {goal && <Switch checked={archived} onChange={setArchived} label="Arquivada" description="Some da lista principal." />}
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir meta?"
        message="Contas, aplicações e lançamentos não mudam."
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
