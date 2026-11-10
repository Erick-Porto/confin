import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Repeat, Trash } from 'lucide-react';
import { useGroupId } from '@/context/GroupContext';
import { useUI, type TransactionDefaults } from '@/context/UIContext';
import { useAccounts, useCategories, useInvestments, useMembers } from '@/hooks/queries';
import { errorMessage } from '@/lib/errors';
import { formatCents, formatDate, parseISODate, todayISO, toISODate } from '@/lib/format';
import { splitInstallments } from '@/lib/rules';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Segmented,
  Select,
  Sheet,
  Switch,
  Textarea,
} from '@/components/ui';
import type { Transaction, TransactionInput, TxStatus, TxType } from '@/types';
import { AccountChips } from './AccountChips';
import { AmountInput } from './AmountInput';
import { AttachmentsSection } from '@/features/attachments/AttachmentsSection';
import { useAddAttachment } from '@/features/attachments/attachments';
import { TagInput } from '@/features/tags/TagInput';
import { CategoryPicker } from './CategoryPicker';
import {
  useCreateInstallments,
  useDeleteTransaction,
  useRestoreTransactions,
  useSaveTransaction,
  type DeleteScope,
} from './mutations';
import { addDays } from 'date-fns';

const LAST_ACCOUNT_KEY = 'confin.lastAccountId';

function readLastAccount(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function rememberAccount(id: string) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    // sem armazenamento: segue sem lembrar
  }
}

const PAID_LABEL: Record<TxType, string> = {
  expense: 'Já foi pago',
  income: 'Já foi recebido',
  transfer: 'Já foi feita',
};

const INSTALLMENT_OPTIONS = Array.from({ length: 71 }, (_, i) => i + 2);

type Errors = Partial<Record<'amount' | 'account' | 'to' | 'category', string>>;

export default function TransactionForm({
  transaction,
  defaults,
  onClose,
}: {
  transaction: Transaction | null;
  defaults: TransactionDefaults | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const groupId = useGroupId();
  const { toast } = useUI();
  const { data: accounts = [], isLoading: loadingAccounts } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: members = [] } = useMembers();
  const { data: investments = [] } = useInvestments();

  const save = useSaveTransaction();
  const createInstallments = useCreateInstallments();
  const addAttachment = useAddAttachment();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const remove = useDeleteTransaction();
  const restore = useRestoreTransactions();

  const editing = transaction !== null;
  const isInstallment = !!transaction?.installment_group_id;

  const [type, setType] = useState<TxType>(transaction?.type ?? defaults?.type ?? 'expense');
  const [cents, setCents] = useState<number>(transaction?.amount_cents ?? defaults?.amount_cents ?? 0);

  const initialCategory = transaction?.category_id ?? defaults?.category_id ?? null;
  const initialCategoryRow = initialCategory ? categories.find((c) => c.id === initialCategory) : undefined;
  const [parentId, setParentId] = useState<string | null>(initialCategoryRow?.parent_id ?? initialCategory);
  const [subId, setSubId] = useState<string | null>(initialCategoryRow?.parent_id ? initialCategory : null);

  // Se as categorias chegarem depois, separa pai e subcategoria do lançamento editado.
  useEffect(() => {
    if (!parentId || subId) return;
    const row = categories.find((c) => c.id === parentId);
    if (row?.parent_id) {
      setParentId(row.parent_id);
      setSubId(row.id);
    }
  }, [categories, parentId, subId]);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const [accountId, setAccountId] = useState<string>(transaction?.account_id ?? defaults?.account_id ?? '');
  const [toAccountId, setToAccountId] = useState<string>(transaction?.to_account_id ?? defaults?.to_account_id ?? '');
  const [investmentId, setInvestmentId] = useState<string>(transaction?.investment_id ?? defaults?.investment_id ?? '');
  // Aplicações das contas de investimento escolhidas; o vínculo some se não combinar mais com elas.
  const investmentOptions = useMemo(() => {
    const ids = type === 'transfer' ? [accountId, toAccountId] : [accountId];
    return investments.filter((i) => (!i.archived || i.id === transaction?.investment_id) && ids.includes(i.account_id));
  }, [investments, type, accountId, toAccountId, transaction?.investment_id]);
  const linkedInvestmentId = investmentOptions.some((i) => i.id === investmentId) ? investmentId : '';

  // Conta padrão: última usada, senão a primeira ativa. Espera as contas carregarem.
  // Nunca a mesma do destino (ex.: "Pagar fatura" já vem com o cartão como destino).
  useEffect(() => {
    if (accountId || activeAccounts.length === 0) return;
    const candidates = activeAccounts.filter((a) => a.id !== toAccountId);
    const pool = toAccountId ? candidates.filter((a) => a.type !== 'credit_card') : candidates;
    const list = pool.length > 0 ? pool : candidates;
    if (list.length === 0) return;
    const last = readLastAccount();
    const pick = list.find((a) => a.id === last) ?? list[0];
    setAccountId(pick.id);
  }, [accountId, activeAccounts, toAccountId]);

  const selectableAccounts = useMemo(
    () => accounts.filter((a) => !a.archived || a.id === transaction?.account_id || a.id === transaction?.to_account_id),
    [accounts, transaction],
  );

  const [date, setDate] = useState<string>(transaction?.date ?? defaults?.date ?? todayISO());
  const [description, setDescription] = useState(transaction?.description ?? defaults?.description ?? '');
  const [tags, setTags] = useState<string[]>(transaction?.tags ?? []);
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [showNotes, setShowNotes] = useState(!!transaction?.notes);
  const [paid, setPaid] = useState<boolean>((transaction?.status ?? defaults?.status ?? 'posted') === 'posted');
  const [installments, setInstallments] = useState(false);
  const showInvestment = investmentOptions.length > 0 && !isInstallment && !(type === 'expense' && installments);
  const [count, setCount] = useState(2);
  const [errors, setErrors] = useState<Errors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scopeSheet, setScopeSheet] = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) return;
    const t = window.setTimeout(() => amountRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [editing]);

  const categoryId = subId ?? parentId;
  const today = todayISO();
  const canInstall = !editing && type === 'expense';
  const busy = save.isPending || createInstallments.isPending;

  const categoryName = categories.find((c) => c.id === categoryId)?.name;
  const placeholder = type === 'transfer' ? 'Transferência' : (categoryName ?? 'Descrição (opcional)');

  function changeType(next: TxType) {
    if (next === type) return;
    setType(next);
    setParentId(null);
    setSubId(null);
    setErrors({});
    if (next !== 'expense') setInstallments(false);
    if (next === 'transfer' && toAccountId === accountId) setToAccountId('');
  }

  function changeAccount(id: string) {
    setAccountId(id);
    if (id === toAccountId) setToAccountId('');
  }

  function validate(): boolean {
    const e: Errors = {};
    if (cents <= 0) e.amount = 'Informe um valor maior que zero.';
    if (!accountId) e.account = 'Escolha uma conta.';
    if (type === 'transfer') {
      if (!toAccountId) e.to = 'Escolha a conta de destino.';
      else if (toAccountId === accountId) e.to = 'O destino precisa ser diferente da origem.';
    } else if (!categoryId) {
      e.category = 'Escolha uma categoria.';
    }
    setErrors(e);
    if (e.amount) amountRef.current?.focus();
    return Object.keys(e).length === 0;
  }

  function buildInput(status: TxStatus): TransactionInput {
    return {
      group_id: groupId,
      type,
      status,
      amount_cents: cents,
      date,
      description: description.trim(),
      notes: notes.trim() ? notes.trim() : null,
      tags,
      account_id: accountId,
      to_account_id: type === 'transfer' ? toAccountId : null,
      category_id: type === 'transfer' ? null : categoryId,
      investment_id: showInvestment ? linkedInvestmentId || null : null,
    };
  }

  async function submit(another: boolean) {
    if (!validate()) return;
    const input = buildInput(paid ? 'posted' : 'planned');
    try {
      let savedId: string | undefined;
      if (!editing && canInstall && installments) {
        const rows = await createInstallments.mutateAsync({ input, count });
        savedId = rows[0]?.id;
      } else {
        savedId = (await save.mutateAsync({ id: transaction?.id, input })).id;
      }
      if (!editing && savedId && pendingFiles.length > 0) {
        try {
          for (const file of pendingFiles) {
            await addAttachment.mutateAsync({ groupId, transactionId: savedId, file });
          }
        } catch (err) {
          toast(`Lançamento salvo, mas um comprovante não foi enviado: ${errorMessage(err)}`, { tone: 'error' });
        }
        setPendingFiles([]);
      }
      rememberAccount(accountId);
      toast('Lançamento salvo');
      if (another) {
        setCents(0);
        setDescription('');
        setNotes('');
        setShowNotes(false);
        setInstallments(false);
        setErrors({});
        window.setTimeout(() => amountRef.current?.focus(), 50);
      } else {
        onClose();
      }
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  async function confirmNow() {
    if (!transaction || !validate()) return;
    try {
      // Uma gravação só: salva os campos atuais já como efetivado.
      await save.mutateAsync({ id: transaction.id, input: buildInput('posted') });
      rememberAccount(accountId);
      toast('Lançamento confirmado');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  async function doDelete(scope: DeleteScope) {
    if (!transaction) return;
    try {
      const rows = await remove.mutateAsync({ tx: transaction, scope });
      setConfirmDelete(false);
      setScopeSheet(false);
      onClose();
      toast('Lançamento excluído', {
        duration: 6000,
        action: {
          label: 'Desfazer',
          onClick: () =>
            restore.mutate(rows, { onError: (err) => toast(errorMessage(err), { tone: 'error' }) }),
        },
      });
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }

  function goTo(path: string) {
    onClose();
    navigate(path);
  }

  const split = installments && cents > 0 ? splitInstallments(cents, count) : null;
  const scheduledHint = paid && date > today;
  const dateChip = (value: string, label: string) => (
    <button
      type="button"
      onClick={() => setDate(value)}
      aria-pressed={date === value}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition ${
        date === value ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-600/20 dark:text-brand-50' : 'border-line bg-surface hover:bg-surface-2'
      }`}
    >
      {label}
    </button>
  );
  const yesterday = toISODate(addDays(parseISODate(today), -1));

  const footer = (
    <div className="space-y-2">
      {editing && transaction?.status === 'planned' && (
        <Button variant="outline" block onClick={confirmNow} loading={save.isPending} disabled={busy}>
          Confirmar agora
        </Button>
      )}
      <div className="flex gap-2">
        {editing && (
          <Button
            variant="ghost"
            className="text-expense!"
            icon={<Trash size={18} />}
            onClick={() => (isInstallment ? setScopeSheet(true) : setConfirmDelete(true))}
            disabled={busy}
            aria-label="Excluir lançamento"
          >
            Excluir
          </Button>
        )}
        <Button block onClick={() => submit(false)} loading={save.isPending || createInstallments.isPending} disabled={busy}>
          Salvar
        </Button>
      </div>
      {!editing && (
        <Button variant="secondary" block onClick={() => submit(true)} disabled={busy}>
          Salvar e lançar outro
        </Button>
      )}
    </div>
  );

  return (
    <>
      <Sheet open onClose={onClose} title={editing ? 'Editar lançamento' : 'Novo lançamento'} footer={footer}>
        <div className="space-y-5">
          <Segmented<TxType>
            value={type}
            onChange={changeType}
            options={[
              { value: 'expense', label: 'Saída' },
              { value: 'income', label: 'Entrada' },
              { value: 'transfer', label: 'Transferência' },
            ]}
          />

          <div>
            <AmountInput ref={amountRef} cents={cents} onChange={setCents} type={type} invalid={!!errors.amount} />
            {errors.amount && <p className="text-center text-sm text-expense">{errors.amount}</p>}
            {installments && split && (
              <p className="text-center text-xs text-muted">Valor total da compra</p>
            )}
          </div>

          {isInstallment && transaction && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <p className="font-medium">
                Parcela {transaction.installment_number} de {transaction.installment_total}
              </p>
              <p className="text-xs text-muted">As alterações valem só para esta parcela.</p>
            </div>
          )}

          {type !== 'transfer' && (
            <CategoryPicker
              categories={categories}
              kind={type}
              parentId={parentId}
              subId={subId}
              onPick={(p, s) => {
                setParentId(p);
                setSubId(s);
                setErrors((e) => ({ ...e, category: undefined }));
              }}
              onManage={() => goTo('/categorias')}
              error={errors.category}
            />
          )}

          {loadingAccounts ? (
            <div className="h-11 animate-pulse rounded-full bg-surface-2" />
          ) : selectableAccounts.length === 0 ? (
            <EmptyState
              title="Nenhuma conta cadastrada"
              description="Cadastre uma conta para lançar suas movimentações."
              action={<Button onClick={() => goTo('/contas')}>Cadastrar conta</Button>}
            />
          ) : type === 'transfer' ? (
            <>
              <AccountChips label="De" accounts={selectableAccounts} members={members} value={accountId} onChange={changeAccount} error={errors.account} />
              <AccountChips
                label="Para"
                accounts={selectableAccounts}
                members={members}
                value={toAccountId}
                onChange={(id) => {
                  setToAccountId(id);
                  setErrors((e) => ({ ...e, to: undefined }));
                }}
                disabledId={accountId}
                error={errors.to}
              />
            </>
          ) : (
            <AccountChips label="Conta" accounts={selectableAccounts} members={members} value={accountId} onChange={changeAccount} error={errors.account} />
          )}

          {showInvestment && (
            <Field label="Aplicação">
              {(id) => (
                <Select id={id} value={linkedInvestmentId} onChange={(e) => setInvestmentId(e.target.value)}>
                  <option value="">Nenhuma</option>
                  {investmentOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <div>
            <div className="mb-1.5 text-sm font-medium">Data</div>
            <div className="flex flex-wrap items-center gap-2">
              {dateChip(today, 'Hoje')}
              {dateChip(yesterday, 'Ontem')}
              <input
                type="date"
                aria-label="Data do lançamento"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
              />
            </div>
          </div>

          <Field label="Descrição">
            {(id) => (
              <Input
                id={id}
                value={description}
                maxLength={120}
                placeholder={placeholder}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>

          <Field label="Tags">{(id) => <TagInput id={id} value={tags} onChange={setTags} />}</Field>

          <AttachmentsSection
            transactionId={transaction?.id}
            pendingFiles={pendingFiles}
            onPendingFilesChange={setPendingFiles}
          />

          {showNotes ? (
            <Field label="Observação">
              {(id) => <Textarea id={id} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-300"
            >
              <ChevronDown size={16} /> Adicionar observação
            </button>
          )}
          {showNotes && !notes && (
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="-mt-3 inline-flex min-h-11 items-center gap-1 text-xs text-muted"
            >
              <ChevronUp size={14} /> Ocultar observação
            </button>
          )}

          <div>
            <Switch
              checked={paid}
              onChange={setPaid}
              label={PAID_LABEL[type]}
              description={paid ? undefined : 'Fica como previsto e não entra no saldo até ser confirmado.'}
            />
            {scheduledHint && <p className="text-xs text-muted">Agendado: entra no saldo em {formatDate(date).slice(0, 5)}</p>}
          </div>

          {canInstall && !isInstallment && (
            <div>
              <Switch checked={installments} onChange={setInstallments} label="Compra parcelada" />
              {installments && (
                <div className="mt-2 space-y-2">
                  <Field label="Número de parcelas">
                    {(id) => (
                      <Select id={id} value={count} onChange={(e) => setCount(Number(e.target.value))}>
                        {INSTALLMENT_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n}x
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {split ? (
                    <p className="text-sm text-muted">
                      {count}x de {formatCents(split[1] ?? split[0])}
                      {split[0] !== split[1] && ` (1ª parcela ${formatCents(split[0])})`}. Uma por mês a partir da data
                      escolhida.
                    </p>
                  ) : (
                    <p className="text-sm text-muted">Digite o valor total da compra.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {!editing && (
            <button
              type="button"
              onClick={() => goTo('/recorrencias?nova=1')}
              className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted hover:text-fg"
            >
              <Repeat size={14} /> Isso se repete? Criar recorrência
            </button>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir lançamento?"
        message="Você poderá desfazer logo após excluir."
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={() => doDelete('one')}
        onCancel={() => setConfirmDelete(false)}
      />

      <Sheet open={scopeSheet} onClose={() => setScopeSheet(false)} title="Excluir parcela">
        <div className="space-y-2">
          <p className="pb-2 text-sm text-muted">Quais parcelas você quer excluir?</p>
          {(
            [
              ['one', 'Só esta parcela'],
              ['this-and-next', 'Esta e as próximas'],
              ['all-installments', 'Todas as parcelas'],
            ] as Array<[DeleteScope, string]>
          ).map(([scope, label]) => (
            <Button key={scope} variant="outline" block disabled={remove.isPending} onClick={() => doDelete(scope)}>
              {label}
            </Button>
          ))}
          <Button variant="ghost" block onClick={() => setScopeSheet(false)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </>
  );
}
