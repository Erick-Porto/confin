import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { useInvalidateFinance, useMembers } from '@/hooks/queries';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { ACCOUNT_TYPE_OPTIONS } from '@/lib/accounts';
import { centsToInput, firstName, parseAmountToCents } from '@/lib/format';
import { COLOR_OPTIONS } from '@/lib/icons';
import { Button, ConfirmDialog, Field, Input, Select, Sheet, Switch } from '@/components/ui';
import type { AccountType, AccountWithBalance } from '@/types';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Interpreta um valor digitado; aceita "-" na frente. Retorna null se inválido. */
function parseSigned(input: string): number | null {
  const text = input.trim();
  const negative = text.startsWith('-');
  const cents = parseAmountToCents(negative ? text.slice(1) : text);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

export function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Cor ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition ${
            value === c ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''
          }`}
          style={{ backgroundColor: c }}
        >
          {value === c && <Check size={18} />}
        </button>
      ))}
    </div>
  );
}

/** Folha de cadastro/edição de conta. Monte só quando for abrir (o estado inicia do zero). */
export function AccountForm({ account, onClose }: { account: AccountWithBalance | null; onClose: () => void }) {
  const groupId = useGroupId();
  const { user } = useAuth();
  const { toast } = useUI();
  const { data: members = [] } = useMembers();
  const invalidateFinance = useInvalidateFinance();
  const editing = !!account;

  const [name, setName] = useState(account?.name ?? '');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking');
  const [ownerId, setOwnerId] = useState<string>(editing ? (account?.owner_id ?? '') : (user?.id ?? ''));
  const [balance, setBalance] = useState(() => {
    if (!account) return '';
    const v = account.initial_balance_cents;
    if (v === 0) return '';
    return centsToInput(account.type === 'credit_card' ? Math.abs(v) : v);
  });
  const [color, setColor] = useState(account?.color ?? COLOR_OPTIONS[0]);
  const [closingDay, setClosingDay] = useState(account?.closing_day ? String(account.closing_day) : '');
  const [dueDay, setDueDay] = useState(account?.due_day ? String(account.due_day) : '');
  const [limit, setLimit] = useState(
    account?.credit_limit_cents != null ? centsToInput(account.credit_limit_cents) : '',
  );
  const [archived, setArchived] = useState(account?.archived ?? false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isCard = type === 'credit_card';
  const parsedBalance = balance.trim() ? parseSigned(balance) : 0;
  const parsedLimit = limit.trim() ? parseAmountToCents(limit) : null;

  const errors = {
    name: name.trim() ? '' : 'Informe o nome da conta.',
    balance: parsedBalance === null ? 'Valor inválido.' : '',
    closing: isCard && !closingDay ? 'Informe o dia de fechamento.' : '',
    due: isCard && !dueDay ? 'Informe o dia de vencimento.' : '',
    limit: limit.trim() && parsedLimit === null ? 'Valor inválido.' : '',
  };
  const invalid = Object.values(errors).some(Boolean);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (invalid || saving) return;
    const raw = parsedBalance ?? 0;
    const initial = isCard ? -Math.abs(raw) : raw;
    const payload = {
      group_id: groupId,
      name: name.trim(),
      institution: institution.trim() || null,
      type,
      owner_id: ownerId || null,
      initial_balance_cents: initial,
      color,
      archived,
      closing_day: isCard ? Number(closingDay) : null,
      due_day: isCard ? Number(dueDay) : null,
      credit_limit_cents: isCard ? parsedLimit : null,
    };
    setSaving(true);
    try {
      const res = account
        ? await supabase.from('accounts').update(payload).eq('id', account.id)
        : await supabase.from('accounts').insert(payload);
      if (res.error) throw res.error;
      await invalidateFinance();
      toast(account ? 'Conta atualizada' : 'Conta criada');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!account) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('accounts').delete().eq('id', account.id);
      if (error) throw error;
      await invalidateFinance();
      toast('Conta excluída');
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
        title={editing ? 'Editar conta' : 'Nova conta'}
        footer={
          <Button type="submit" form="account-form" block loading={saving}>
            Salvar
          </Button>
        }
      >
        <form id="account-form" onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Nome" error={submitted ? errors.name : ''}>
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nubank" maxLength={60} />}
          </Field>
          <Field label="Instituição (opcional)">
            {(id) => (
              <Input
                id={id}
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Nu Pagamentos"
                maxLength={60}
              />
            )}
          </Field>
          <Field label="Tipo">
            {(id) => (
              <Select id={id} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {ACCOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Titular">
            {(id) => (
              <Select id={id} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {firstName(m.profile?.full_name)}
                  </option>
                ))}
                <option value="">Conjunta</option>
              </Select>
            )}
          </Field>
          <Field
            label={isCard ? 'Fatura em aberto hoje (opcional)' : 'Saldo inicial'}
            hint={isCard ? 'Informe o valor devido hoje; ele entra como saldo negativo.' : 'Use "-" na frente se a conta estiver no negativo.'}
            error={submitted ? errors.balance : ''}
          >
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0,00"
              />
            )}
          </Field>
          {isCard && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dia de fechamento" error={submitted ? errors.closing : ''}>
                  {(id) => (
                    <Select id={id} value={closingDay} onChange={(e) => setClosingDay(e.target.value)}>
                      <option value="">Selecione</option>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Dia de vencimento" error={submitted ? errors.due : ''}>
                  {(id) => (
                    <Select id={id} value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
                      <option value="">Selecione</option>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <Field label="Limite (opcional)" error={submitted ? errors.limit : ''}>
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="0,00"
                  />
                )}
              </Field>
            </>
          )}
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">Cor</span>
            <ColorSwatches value={color} onChange={setColor} />
          </div>
          {editing && (
            <div className="space-y-2 border-t border-line pt-3">
              <Switch
                checked={archived}
                onChange={setArchived}
                label="Arquivada"
                description="Esconde a conta das listas, mantendo o histórico."
              />
              <Button variant="ghost" block className="text-expense!" onClick={() => setConfirmDelete(true)}>
                Excluir conta
              </Button>
            </div>
          )}
        </form>
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir conta?"
        message="Isso não pode ser desfeito. Se a conta tem lançamentos, arquive em vez de excluir."
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
