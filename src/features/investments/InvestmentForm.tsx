import { useMemo, useState } from 'react';
import { useAccounts, useMembers } from '@/hooks/queries';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { Button, Field, Input, Select, Sheet, Switch } from '@/components/ui';
import { accountLabel } from '@/lib/accounts';
import { errorMessage } from '@/lib/errors';
import { todayISO } from '@/lib/format';
import type { Investment, InvestmentClass } from '@/types';
import { INVESTMENT_CLASS_OPTIONS } from './portfolio';
import { MoneyField } from './MoneyField';
import { useSaveInvestment } from './mutations';

/** Cadastro e edição de aplicação. */
export function InvestmentForm({
  investment,
  onClose,
  onSaved,
}: {
  investment: Investment | null;
  onClose: () => void;
  onSaved?: (inv: Investment) => void;
}) {
  const groupId = useGroupId();
  const { toast } = useUI();
  const { data: accounts = [] } = useAccounts();
  const { data: members = [] } = useMembers();
  const save = useSaveInvestment();

  const investAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'investment' && (!a.archived || a.id === investment?.account_id)),
    [accounts, investment],
  );

  const [name, setName] = useState(investment?.name ?? '');
  const [cls, setCls] = useState<InvestmentClass>(investment?.class ?? 'fixed_income');
  const [accountId, setAccountId] = useState(investment?.account_id ?? '');
  const [openingDate, setOpeningDate] = useState(investment?.opening_date ?? todayISO());
  const [valueCents, setValueCents] = useState(investment?.opening_value_cents ?? 0);
  const [costCents, setCostCents] = useState(investment?.opening_cost_cents ?? 0);
  const [costTouched, setCostTouched] = useState(!!investment);
  const [archived, setArchived] = useState(investment?.archived ?? false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAccount = accountId || investAccounts[0]?.id || '';

  async function submit() {
    if (!name.trim()) return setError('Informe o nome da aplicação.');
    if (!effectiveAccount) return setError('Escolha a conta de investimento.');
    setError(null);
    try {
      const saved = await save.mutateAsync({
        id: investment?.id,
        input: {
          group_id: groupId,
          account_id: effectiveAccount,
          name: name.trim(),
          class: cls,
          opening_date: openingDate,
          opening_value_cents: valueCents,
          opening_cost_cents: costCents,
          archived,
        },
      });
      toast(investment ? 'Aplicação atualizada' : 'Aplicação criada');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={investment ? 'Editar aplicação' : 'Nova aplicação'}
      footer={
        <Button block loading={save.isPending} onClick={() => void submit()}>
          Salvar
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        <Field label="Nome" error={error && !name.trim() ? error : undefined}>
          {(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex.: CDB Banco X" />}
        </Field>
        <Field label="Classe">
          {(id) => (
            <Select id={id} value={cls} onChange={(e) => setCls(e.target.value as InvestmentClass)}>
              {INVESTMENT_CLASS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Conta" error={error && name.trim() ? error : undefined}>
          {(id) => (
            <Select id={id} value={effectiveAccount} onChange={(e) => setAccountId(e.target.value)}>
              {investAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a, members)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Data de início">
          {(id) => <Input id={id} type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value || todayISO())} />}
        </Field>
        <Field label="Valor hoje" hint="Aplicação nova? Deixe 0 e lance o primeiro aporte.">
          {(id) => (
            <MoneyField
              id={id}
              cents={valueCents}
              onChange={(c) => {
                setValueCents(c);
                if (!costTouched) setCostCents(c);
              }}
            />
          )}
        </Field>
        <Field label="Quanto já foi aplicado">
          {(id) => (
            <MoneyField
              id={id}
              cents={costCents}
              onChange={(c) => {
                setCostTouched(true);
                setCostCents(c);
              }}
            />
          )}
        </Field>
        {investment && <Switch checked={archived} onChange={setArchived} label="Arquivada" description="Some da carteira, mas o histórico fica." />}
      </div>
    </Sheet>
  );
}
