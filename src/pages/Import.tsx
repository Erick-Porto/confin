import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addDays } from 'date-fns';
import { AlertTriangle, FileUp } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Money, PageHeader, SectionTitle, Select, Skeleton, Switch, TxAmount } from '@/components/ui';
import { useAccounts, useCategories, useInvalidateFinance, useMembers, useTransactions } from '@/hooks/queries';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { accountLabel, sortAccounts } from '@/lib/accounts';
import { categoryPath } from '@/lib/categories';
import { errorMessage } from '@/lib/errors';
import { formatDate, parseISODate, toISODate, todayISO } from '@/lib/format';
import { applyCsvMapping, readImportFile, type CsvMapping, type ImportRow, type ParsedFile } from '@/features/import/parse';
import {
  buildReview,
  DUPLICATE_WINDOW_DAYS,
  importTransactions,
  toTransactionInputs,
  type ReviewRow,
  type ReviewStatus,
} from '@/features/import/review';

type Override = Partial<Pick<ReviewRow, 'include' | 'description' | 'categoryId'>>;

const STATUS_LABEL: Record<Exclude<ReviewStatus, 'new'>, string> = {
  imported: 'Já importado',
  duplicate: 'Possível duplicado',
  'card-payment': 'Pagamento de fatura',
};

/** Seletor de coluna do CSV (valor = índice da coluna). */
function ColumnSelect({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <Select id={id} value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Escolha a coluna</option>
          {headers.map((h, i) => (
            <option key={i} value={i}>
              {h || `Coluna ${i + 1}`}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

const EMPTY_MAPPING: CsvMapping = { date: -1, description: -1, amount: null, debit: null, credit: null, id: null };

export default function Import() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const groupId = useGroupId();
  const { toast } = useUI();
  const invalidate = useInvalidateFinance();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: accounts = [], isPending: accountsLoading } = useAccounts();
  const { data: members = [] } = useMembers();
  const { data: categories = [] } = useCategories();
  const active = useMemo(() => sortAccounts(accounts.filter((a) => !a.archived)), [accounts]);

  const [accountPick, setAccountPick] = useState(params.get('conta') ?? '');
  const accountId = active.some((a) => a.id === accountPick) ? accountPick : (active[0]?.id ?? '');
  const account = active.find((a) => a.id === accountId);

  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>(EMPTY_MAPPING);
  const [split, setSplit] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [invert, setInvert] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [saving, setSaving] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const result = await readImportFile(file);
      setParsed(result);
      setFileName(file.name);
      setMapping(result.csv?.mapping ?? EMPTY_MAPPING);
      setSplit(!!result.csv?.mapping && result.csv.mapping.amount === null);
      setRows(result.rows);
      setSkipped(result.skipped);
      setInvert(result.suggestInvert);
      setOverrides({});
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const changeMapping = (patch: Partial<CsvMapping>) => {
    if (!parsed?.csv) return;
    const next = { ...mapping, ...patch };
    setMapping(next);
    setOverrides({});
    const ready = next.date >= 0 && next.description >= 0 && (next.amount !== null || (next.debit !== null && next.credit !== null));
    if (ready) {
      const res = applyCsvMapping(parsed.csv, next);
      setRows(res.rows);
      setSkipped(res.skipped);
    } else {
      setRows([]);
      setSkipped(0);
    }
  };

  // Janela de datas do arquivo → lançamentos da conta (duplicados) e histórico do grupo (categorias).
  const range = useMemo(() => {
    if (rows.length === 0) return null;
    const dates = rows.map((r) => r.date).sort();
    return {
      from: toISODate(addDays(parseISODate(dates[0]), -DUPLICATE_WINDOW_DAYS)),
      to: toISODate(addDays(parseISODate(dates[dates.length - 1]), DUPLICATE_WINDOW_DAYS)),
    };
  }, [rows]);
  const historyFrom = useMemo(() => toISODate(addDays(parseISODate(todayISO()), -365)), []);
  const enabled = !!range && !!accountId;
  const existingQ = useTransactions({ accountId, from: range?.from, to: range?.to }, { enabled });
  const historyQ = useTransactions({ from: historyFrom }, { enabled });
  const reviewLoading = enabled && (existingQ.isPending || historyQ.isPending);
  const reviewError = existingQ.error ?? historyQ.error;

  const base = useMemo(
    () =>
      account && existingQ.data && historyQ.data
        ? buildReview(rows, { account, invert, existing: existingQ.data, history: historyQ.data, categories })
        : [],
    [account, rows, invert, existingQ.data, historyQ.data, categories],
  );
  const review: ReviewRow[] = useMemo(() => base.map((r) => (overrides[r.key] ? { ...r, ...overrides[r.key] } : r)), [base, overrides]);

  const patch = (key: string, o: Override) => setOverrides((cur) => ({ ...cur, [key]: { ...cur[key], ...o } }));
  const markAll = (on: boolean) =>
    setOverrides((cur) => {
      const next = { ...cur };
      for (const r of base) {
        if (r.status === 'imported') continue;
        if (on && r.status !== 'new') continue;
        next[r.key] = { ...next[r.key], include: on };
      }
      return next;
    });

  const selected = review.filter((r) => r.include && r.status !== 'imported');
  const incomeTotal = selected.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expenseTotal = selected.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

  let cardMismatch: string | null = null;
  if (parsed && account) {
    const isCard = account.type === 'credit_card';
    if (parsed.creditCard && !isCard) cardMismatch = 'Este arquivo é de cartão de crédito, mas a conta escolhida não é um cartão.';
    else if (!parsed.creditCard && isCard && parsed.format === 'ofx') cardMismatch = 'A conta escolhida é um cartão de crédito, mas o arquivo parece ser de conta corrente.';
  }

  const save = async () => {
    if (!account || selected.length === 0) return;
    setSaving(true);
    try {
      const created = await importTransactions(toTransactionInputs(review, { groupId, accountId: account.id }));
      toast(`${created} ${created === 1 ? 'lançamento importado' : 'lançamentos importados'}`);
      invalidate();
      navigate(`/extrato?conta=${account.id}`);
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
      setSaving(false);
    }
  };

  const csv = parsed?.csv ?? null;
  const preview = csv ? csv.records.slice(0, 3) : [];
  const idx = (v: number) => (v >= 0 ? v : null);

  return (
    <div className="pb-28">
      <PageHeader title="Importar extrato" back />
      <div className="flex flex-col gap-4">
        {/* 1. Conta e arquivo */}
        <Card className="space-y-4">
          {accountsLoading ? (
            <Skeleton className="h-11" />
          ) : active.length === 0 ? (
            <EmptyState title="Nenhuma conta ativa" description="Cadastre uma conta antes de importar um extrato." />
          ) : (
            <>
              <Field label="Importar para a conta">
                {(id) => (
                  <Select
                    id={id}
                    value={accountId}
                    onChange={(e) => {
                      setAccountPick(e.target.value);
                      setOverrides({});
                    }}
                  >
                    {active.map((a) => (
                      <option key={a.id} value={a.id}>
                        {accountLabel(a, members)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <input ref={fileRef} type="file" accept=".ofx,.csv,.txt" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Button block variant="outline" icon={<FileUp size={18} />} loading={reading} onClick={() => fileRef.current?.click()}>
                {parsed ? 'Escolher outro arquivo' : 'Escolher arquivo'}
              </Button>
              <p className="text-xs text-muted">
                {parsed ? `Arquivo: ${fileName}. ` : ''}Baixe o extrato no app ou site do banco em OFX (melhor) ou CSV.
              </p>
            </>
          )}
        </Card>

        {/* 2. Colunas do CSV */}
        {csv && (
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Colunas do arquivo</h2>
            {!csv.mapping && <p className="text-sm text-muted">Não deu para identificar as colunas. Escolha abaixo.</p>}
            <ColumnSelect label="Data" headers={csv.headers} value={idx(mapping.date)} onChange={(v) => changeMapping({ date: v ?? -1 })} />
            <ColumnSelect label="Descrição" headers={csv.headers} value={idx(mapping.description)} onChange={(v) => changeMapping({ description: v ?? -1 })} />
            <Switch
              checked={split}
              onChange={(on) => {
                setSplit(on);
                changeMapping({ amount: null, debit: null, credit: null });
              }}
              label="Débito e crédito em colunas separadas"
            />
            {split ? (
              <>
                <ColumnSelect label="Débito (saídas)" headers={csv.headers} value={mapping.debit} onChange={(v) => changeMapping({ amount: null, debit: v })} />
                <ColumnSelect label="Crédito (entradas)" headers={csv.headers} value={mapping.credit} onChange={(v) => changeMapping({ amount: null, credit: v })} />
              </>
            ) : (
              <ColumnSelect label="Valor" headers={csv.headers} value={mapping.amount} onChange={(v) => changeMapping({ amount: v, debit: null, credit: null })} />
            )}
            {preview.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      {csv.headers.map((h, i) => (
                        <th key={i} className="whitespace-nowrap px-2 py-1.5 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((rec, i) => (
                      <tr key={i} className="border-t border-line">
                        {csv.headers.map((_, j) => (
                          <td key={j} className="whitespace-nowrap px-2 py-1.5">
                            {rec[j]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* 3. Revisão */}
        {parsed && rows.length === 0 && (!csv || mapping.date >= 0) && !reading && (
          <Card>
            <EmptyState title="Nenhum lançamento encontrado" description="Confira o arquivo e as colunas escolhidas." />
          </Card>
        )}
        {rows.length > 0 && (
          <>
            {cardMismatch && (
              <div className="flex gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-expense" />
                <p>{cardMismatch}</p>
              </div>
            )}
            <Card>
              <Switch
                checked={invert}
                onChange={(v) => {
                  setInvert(v);
                  setOverrides({});
                }}
                label="Inverter sinais"
                description="Use quando as compras aparecem como entradas (comum em fatura de cartão)."
              />
            </Card>

            <SectionTitle>Revisar {rows.length} lançamentos</SectionTitle>
            {reviewLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
            ) : reviewError ? (
              <Card>
                <EmptyState title="Não foi possível carregar" description={errorMessage(reviewError)} />
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => markAll(true)}>
                    Marcar todos os novos
                  </Button>
                  <Button variant="outline" onClick={() => markAll(false)}>
                    Desmarcar todos
                  </Button>
                </div>
                {skipped > 0 && (
                  <p className="text-xs text-muted">
                    {skipped} {skipped === 1 ? 'linha ignorada' : 'linhas ignoradas'} (data ou valor ilegível).
                  </p>
                )}
                <ul className="flex flex-col gap-3">
                  {review.map((r) => {
                    const disabled = r.status === 'imported';
                    return (
                      <li key={r.key} className={`rounded-2xl border border-line bg-surface p-3 ${disabled ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-1">
                          <label className="flex h-11 w-11 shrink-0 items-center justify-center">
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-brand-700"
                              checked={r.include && !disabled}
                              disabled={disabled}
                              onChange={(e) => patch(r.key, { include: e.target.checked })}
                              aria-label={`Importar ${r.description}`}
                            />
                          </label>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-muted">{formatDate(r.date)}</span>
                              <TxAmount type={r.type} cents={r.amount} className="text-sm font-semibold" />
                            </div>
                            <Input
                              value={r.description}
                              disabled={disabled}
                              maxLength={120}
                              onChange={(e) => patch(r.key, { description: e.target.value })}
                              aria-label="Descrição"
                            />
                            {!disabled && (
                              <Select value={r.categoryId ?? ''} onChange={(e) => patch(r.key, { categoryId: e.target.value || null })} aria-label="Categoria">
                                <option value="">Sem categoria</option>
                                {categories
                                  .filter((c) => c.kind === r.type && !c.archived)
                                  .map((c) => ({ id: c.id, path: categoryPath(c.id, categories) }))
                                  .sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'))
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.path}
                                    </option>
                                  ))}
                              </Select>
                            )}
                            {r.status !== 'new' && (
                              <p className="text-xs">
                                <span className="mr-1.5 inline-flex rounded-full bg-surface-2 px-2 py-0.5 font-medium text-muted">{STATUS_LABEL[r.status]}</span>
                                {r.status === 'duplicate' && r.match && (
                                  <span className="text-muted">
                                    Parecido com {formatDate(r.match.date)} · {r.match.description}
                                  </span>
                                )}
                                {r.status === 'card-payment' && <span className="text-muted">Lance como transferência a partir da conta que pagou.</span>}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      {rows.length > 0 && !reviewLoading && !reviewError && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface px-4 py-3">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1 text-xs text-muted">
              <p className="font-medium text-fg">{selected.length} selecionados</p>
              <p>
                <Money cents={incomeTotal} tone="income" /> · <Money cents={expenseTotal} tone="expense" />
              </p>
            </div>
            <Button loading={saving} disabled={saving || selected.length === 0} onClick={() => void save()}>
              Importar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
