import { useMemo, useState } from 'react';
import { Button, ConfirmDialog, Field, Input, Segmented, Select, Sheet, Switch } from '@/components/ui';
import { TransactionRow } from '@/components/TransactionRow';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { generateRecurrences, useAccounts, useCategories, useInvalidateFinance, useMembers, useTransactions } from '@/hooks/queries';
import { accountLabel } from '@/lib/accounts';
import { buildCategoryTree } from '@/lib/categories';
import { errorMessage } from '@/lib/errors';
import { centsToInput, parseAmountToCents, todayISO } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Recurrence, RecurrenceFreq, TxType } from '@/types';

const TYPE_OPTIONS: Array<{ value: TxType; label: string }> = [
  { value: 'expense', label: 'Saída' },
  { value: 'income', label: 'Entrada' },
  { value: 'transfer', label: 'Transferência' },
];

const FREQ_OPTIONS: Array<{ value: RecurrenceFreq; label: string }> = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
];

const FREQ_UNIT: Record<RecurrenceFreq, [string, string]> = {
  weekly: ['semana', 'semanas'],
  monthly: ['mês', 'meses'],
  yearly: ['ano', 'anos'],
};

/** Formulário de criar/editar recorrência. Monte só quando for abrir (o estado inicia na montagem). */
export function RecurrenceForm({ recurrence, onClose }: { recurrence: Recurrence | null; onClose: () => void }) {
  const groupId = useGroupId();
  const { toast } = useUI();
  const invalidateFinance = useInvalidateFinance();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: members = [] } = useMembers();
  const editing = !!recurrence;

  const [type, setType] = useState<TxType>(recurrence?.type ?? 'expense');
  const [amount, setAmount] = useState(recurrence ? centsToInput(recurrence.amount_cents) : '');
  const [description, setDescription] = useState(recurrence?.description ?? '');
  const [categoryId, setCategoryId] = useState(recurrence?.category_id ?? '');
  const [accountId, setAccountId] = useState(recurrence?.account_id ?? '');
  const [toAccountId, setToAccountId] = useState(recurrence?.to_account_id ?? '');
  const [freq, setFreq] = useState<RecurrenceFreq>(recurrence?.freq ?? 'monthly');
  const [interval, setIntervalCount] = useState(recurrence?.interval_count ?? 1);
  const [startDate, setStartDate] = useState(recurrence?.start_date ?? todayISO());
  const [hasEnd, setHasEnd] = useState(!!recurrence?.end_date);
  const [endDate, setEndDate] = useState(recurrence?.end_date ?? '');
  const [active, setActive] = useState(recurrence?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectableAccounts = useMemo(
    () => accounts.filter((a) => !a.archived || a.id === recurrence?.account_id || a.id === recurrence?.to_account_id),
    [accounts, recurrence],
  );
  const tree = useMemo(() => (type === 'transfer' ? [] : buildCategoryTree(categories, type)), [categories, type]);

  const upcoming = useTransactions({ recurrenceId: recurrence?.id ?? '', status: 'planned' }, { enabled: editing });

  const changeType = (next: TxType) => {
    setType(next);
    setCategoryId('');
  };

  const save = async () => {
    const cents = parseAmountToCents(amount);
    const desc = description.trim();
    if (!cents || cents <= 0) return setError('Informe um valor maior que zero.');
    if (!desc) return setError('Informe a descrição.');
    if (!accountId) return setError('Escolha a conta.');
    if (type !== 'transfer' && !categoryId) return setError('Escolha a categoria.');
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      return setError('Escolha uma conta de destino diferente da origem.');
    }
    if (!startDate) return setError('Informe a primeira data.');
    if (hasEnd && (!endDate || endDate < startDate)) return setError('A data final deve ser igual ou depois da primeira data.');
    setError(null);
    setSaving(true);
    try {
      const payload = {
        group_id: groupId,
        type,
        amount_cents: cents,
        description: desc,
        account_id: accountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        category_id: type === 'transfer' ? null : categoryId,
        freq,
        interval_count: interval,
        start_date: startDate,
        end_date: hasEnd ? endDate : null,
        active,
      };
      const res = recurrence
        ? await supabase.from('recurrences').update(payload).eq('id', recurrence.id)
        : await supabase.from('recurrences').insert(payload);
      if (res.error) throw res.error;
      const generated = await generateRecurrences(groupId);
      await invalidateFinance();
      toast(`Recorrência salva${generated > 0 ? ` · ${generated} lançamentos previstos` : ''}`);
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!recurrence) return;
    setDeleting(true);
    try {
      const { error: delError } = await supabase.from('recurrences').delete().eq('id', recurrence.id);
      if (delError) throw delError;
      await invalidateFinance();
      toast('Recorrência excluída');
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const [unitOne, unitMany] = FREQ_UNIT[freq];

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={editing ? 'Editar recorrência' : 'Nova recorrência'}
        footer={
          <div className="flex gap-3">
            {editing && (
              <Button variant="outline" onClick={() => setConfirmDelete(true)} disabled={saving} className="text-expense!">
                Excluir
              </Button>
            )}
            <Button block onClick={save} loading={saving}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pt-1">
          <Segmented options={TYPE_OPTIONS} value={type} onChange={changeType} />

          <Field label="Valor">
            {(id) => (
              <Input id={id} inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
          </Field>

          <Field label="Descrição">
            {(id) => (
              <Input
                id={id}
                maxLength={120}
                placeholder="Ex.: Aluguel, Salário, Netflix"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>

          {type !== 'transfer' && (
            <Field label="Categoria">
              {(id) => (
                <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Selecione</option>
                  {tree.flatMap((parent) => [
                    <option key={parent.id} value={parent.id}>
                      {parent.name}
                    </option>,
                    ...parent.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {'    '}
                        {child.name}
                      </option>
                    )),
                  ])}
                </Select>
              )}
            </Field>
          )}

          <Field label={type === 'transfer' ? 'Conta de origem' : 'Conta'}>
            {(id) => (
              <Select id={id} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Selecione</option>
                {selectableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a, members)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {type === 'transfer' && (
            <Field label="Conta de destino">
              {(id) => (
                <Select id={id} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  <option value="">Selecione</option>
                  {selectableAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {accountLabel(a, members)}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          )}

          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Frequência</span>
            <Segmented options={FREQ_OPTIONS} value={freq} onChange={setFreq} />
          </div>

          <Field label="A cada">
            {(id) => (
              <Select id={id} value={interval} onChange={(e) => setIntervalCount(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? `1 ${unitOne}` : `${n} ${unitMany}`}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Primeira data" hint="As próximas seguem a partir desta data">
            {(id) => <Input id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}
          </Field>

          <div>
            <Switch label="Tem data final" checked={hasEnd} onChange={setHasEnd} />
            {hasEnd && (
              <Field label="Data final" className="mt-2">
                {(id) => <Input id={id} type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />}
              </Field>
            )}
          </div>

          {editing && (
            <Switch
              label="Ativa"
              description="Ao pausar, os lançamentos previstos futuros são removidos."
              checked={active}
              onChange={setActive}
            />
          )}

          {error && <p className="text-sm text-expense">{error}</p>}

          {editing && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-muted">Próximos lançamentos</h3>
              {upcoming.isLoading ? (
                <p className="py-3 text-sm text-muted">Carregando...</p>
              ) : upcoming.data && upcoming.data.length > 0 ? (
                <div className="divide-y divide-line">
                  {[...upcoming.data]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} showDate />
                    ))}
                </div>
              ) : (
                <p className="py-3 text-sm text-muted">Nenhum lançamento previsto no momento.</p>
              )}
              <p className="mt-2 text-xs text-muted">
                Editar altera só os lançamentos previstos daqui para frente. Os já confirmados continuam como estão.
              </p>
            </section>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir recorrência?"
        message="Os lançamentos previstos desta recorrência serão removidos. Os já confirmados ficam no extrato."
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
