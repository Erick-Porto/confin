import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Funnel, Receipt, Search, X } from 'lucide-react';
import { useUI } from '@/context/UIContext';
import { useAccounts, useCategories, useMembers, useTransactions } from '@/hooks/queries';
import { accountLabel, ownerLabel } from '@/lib/accounts';
import { buildCategoryTree, categoryPath, categoryWithChildrenIds } from '@/lib/categories';
import { formatDayHeader } from '@/lib/format';
import { isEffective, isPlanned, sumIncomeExpense } from '@/lib/rules';
import { PeriodSwitcher, usePeriodParam } from '@/components/PeriodSwitcher';
import { TransactionRow } from '@/components/TransactionRow';
import {
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Money,
  PageHeader,
  Select,
  Sheet,
  Skeleton,
  Switch,
} from '@/components/ui';
import type { Transaction, TransactionFilters, TxType } from '@/types';

const TYPE_LABELS: Record<TxType, string> = {
  income: 'Entradas',
  expense: 'Saídas',
  transfer: 'Transferências',
};

function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function isTxType(v: string | null): v is TxType {
  return v === 'income' || v === 'expense' || v === 'transfer';
}

interface Draft {
  conta: string;
  categoria: string;
  tipo: string;
  membro: string;
  previsto: boolean;
}

export default function Statement() {
  const { openTransactionSheet } = useUI();
  const [period, setPeriod] = usePeriodParam();
  const [params, setParams] = useSearchParams();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: members = [] } = useMembers();

  const conta = params.get('conta') ?? '';
  const categoria = params.get('categoria') ?? '';
  const tipoRaw = params.get('tipo');
  const tipo = isTxType(tipoRaw) ? tipoRaw : null;
  const previsto = params.get('situacao') === 'previsto';
  const membro = params.get('membro') ?? '';

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ conta: '', categoria: '', tipo: '', membro: '', previsto: false });

  const activeCount = [conta, categoria, tipo, membro, previsto].filter(Boolean).length;

  const filters = useMemo<TransactionFilters>(() => {
    const f: TransactionFilters = { from: period.start, to: period.end };
    if (conta) f.accountId = conta;
    if (categoria) f.categoryIds = categoryWithChildrenIds(categoria, categories);
    if (tipo) f.type = tipo;
    if (previsto) f.status = 'planned';
    return f;
  }, [period.start, period.end, conta, categoria, tipo, previsto, categories]);

  const { data: rawTxs, isLoading, isError, refetch } = useTransactions(filters);

  const txs = useMemo<Transaction[]>(() => {
    let list = rawTxs ?? [];
    if (membro) {
      const owned = new Set(accounts.filter((a) => a.owner_id === membro).map((a) => a.id));
      list = list.filter((t) => owned.has(t.account_id) || (t.to_account_id !== null && owned.has(t.to_account_id)));
    }
    const q = normalizeText(query.trim());
    if (q) {
      list = list.filter((t) => {
        const catName = t.category_id ? (categories.find((c) => c.id === t.category_id)?.name ?? '') : '';
        return normalizeText(`${t.description} ${t.notes ?? ''} ${catName}`).includes(q);
      });
    }
    return list;
  }, [rawTxs, membro, accounts, query, categories]);

  const totals = useMemo(() => sumIncomeExpense(txs), [txs]);
  const planned = useMemo(() => {
    const items = txs.filter(isPlanned);
    const net = items.reduce(
      (s, t) => s + (t.type === 'income' ? t.amount_cents : t.type === 'expense' ? -t.amount_cents : 0),
      0,
    );
    return { count: items.length, net };
  }, [txs]);

  const days = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of txs) {
      const arr = map.get(t.date);
      if (arr) arr.push(t);
      else map.set(t.date, [t]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [txs]);

  function updateParams(patch: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  }

  function openFilters() {
    setDraft({ conta, categoria, tipo: tipo ?? '', membro, previsto });
    setFilterOpen(true);
  }

  function applyFilters() {
    updateParams({
      conta: draft.conta || null,
      categoria: draft.categoria || null,
      tipo: draft.tipo || null,
      membro: draft.membro || null,
      situacao: draft.previsto ? 'previsto' : null,
    });
    setFilterOpen(false);
  }

  function clearFilters() {
    updateParams({ conta: null, categoria: null, tipo: null, membro: null, situacao: null });
    setFilterOpen(false);
  }

  function newTransaction() {
    openTransactionSheet({
      defaults: {
        ...(conta ? { account_id: conta } : {}),
        ...(tipo ? { type: tipo } : {}),
        ...(categoria ? { category_id: categoria } : {}),
      },
    });
  }

  const chips: Array<{ key: string; label: string; clear: Record<string, null> }> = [];
  if (conta) {
    const a = accounts.find((x) => x.id === conta);
    chips.push({ key: 'conta', label: a ? accountLabel(a, members) : 'Conta', clear: { conta: null } });
  }
  if (categoria) chips.push({ key: 'categoria', label: categoryPath(categoria, categories), clear: { categoria: null } });
  if (tipo) chips.push({ key: 'tipo', label: TYPE_LABELS[tipo], clear: { tipo: null } });
  if (membro) chips.push({ key: 'membro', label: ownerLabel(membro, members), clear: { membro: null } });
  if (previsto) chips.push({ key: 'situacao', label: 'Só previstos', clear: { situacao: null } });

  const categoryOptions = (['expense', 'income'] as const).map((kind) => (
    <optgroup key={kind} label={kind === 'expense' ? 'Saídas' : 'Entradas'}>
      {buildCategoryTree(categories, kind, true).map((c) => (
        <Fragment key={c.id}>
          <option value={c.id}>{c.name}</option>
          {c.children.map((s) => (
            <option key={s.id} value={s.id}>
              {'   '}
              {s.name}
            </option>
          ))}
        </Fragment>
      ))}
    </optgroup>
  ));

  return (
    <div className="pb-6">
      <PageHeader
        title="Extrato"
        actions={
          <>
            <IconButton
              aria-label={searchOpen ? 'Fechar busca' : 'Buscar'}
              onClick={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setQuery('');
              }}
            >
              <Search size={20} />
            </IconButton>
            <IconButton aria-label="Filtros" onClick={openFilters} className="relative">
              <Funnel size={20} />
              {activeCount > 0 && (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-bg" />
              )}
            </IconButton>
          </>
        }
      />

      <PeriodSwitcher period={period} onChange={setPeriod} />

      {searchOpen && (
        <div className="mt-3">
          <Input
            type="search"
            autoFocus
            aria-label="Buscar lançamentos"
            placeholder="Buscar por descrição, observação ou categoria"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {chips.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => updateParams(c.clear)}
              aria-label={`Remover filtro ${c.label}`}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 text-sm font-medium text-brand-800 dark:bg-brand-600/20 dark:text-brand-50"
            >
              {c.label}
              <X size={14} />
            </button>
          ))}
        </div>
      )}

      <Card className="mt-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-muted">Entradas</div>
            <Money cents={totals.income} tone="income" className="text-sm font-semibold" />
          </div>
          <div>
            <div className="text-xs text-muted">Saídas</div>
            <Money cents={totals.expense} tone="expense" className="text-sm font-semibold" />
          </div>
          <div>
            <div className="text-xs text-muted">Resultado</div>
            <Money cents={totals.net} tone="auto" className="text-sm font-semibold" />
          </div>
        </div>
        {planned.count > 0 && (
          <p className="mt-3 border-t border-line pt-2 text-center text-xs text-muted">
            {planned.count} {planned.count === 1 ? 'previsto' : 'previstos'} · <Money cents={planned.net} />
          </p>
        )}
      </Card>

      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-1">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            title="Não foi possível carregar o extrato"
            description="Verifique sua conexão e tente de novo."
            action={<Button onClick={() => void refetch()}>Tentar de novo</Button>}
          />
        ) : txs.length === 0 ? (
          <EmptyState
            icon={<Receipt size={36} />}
            title={query || activeCount > 0 ? 'Nenhum lançamento encontrado' : 'Nenhum lançamento neste período'}
            description={query || activeCount > 0 ? 'Tente mudar a busca ou os filtros.' : undefined}
            action={<Button onClick={newTransaction}>Novo lançamento</Button>}
          />
        ) : (
          <div>
            {days.map(([date, items]) => {
              const net = sumIncomeExpense(items).net;
              return (
                <section key={date} className="mb-2">
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-bg px-1 py-2">
                    <h2 className="text-sm font-semibold capitalize">{formatDayHeader(date)}</h2>
                    {items.some((t) => isEffective(t)) && (
                      <Money cents={net} signed className="text-xs text-muted" />
                    )}
                  </div>
                  <div className="divide-y divide-line/60">
                    {items.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} onClick={() => openTransactionSheet({ transaction: tx })} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <Sheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filtros"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" block onClick={clearFilters}>
              Limpar
            </Button>
            <Button block onClick={applyFilters}>
              Aplicar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Conta">
            {(id) => (
              <Select id={id} value={draft.conta} onChange={(e) => setDraft({ ...draft, conta: e.target.value })}>
                <option value="">Todas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a, members)}
                    {a.archived ? ' (arquivada)' : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Categoria">
            {(id) => (
              <Select id={id} value={draft.categoria} onChange={(e) => setDraft({ ...draft, categoria: e.target.value })}>
                <option value="">Todas</option>
                {categoryOptions}
              </Select>
            )}
          </Field>
          <Field label="Tipo">
            {(id) => (
              <Select id={id} value={draft.tipo} onChange={(e) => setDraft({ ...draft, tipo: e.target.value })}>
                <option value="">Todos</option>
                <option value="expense">Saídas</option>
                <option value="income">Entradas</option>
                <option value="transfer">Transferências</option>
              </Select>
            )}
          </Field>
          <Field label="Membro">
            {(id) => (
              <Select id={id} value={draft.membro} onChange={(e) => setDraft({ ...draft, membro: e.target.value })}>
                <option value="">Todos</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {ownerLabel(m.user_id, members)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Switch
            checked={draft.previsto}
            onChange={(v) => setDraft({ ...draft, previsto: v })}
            label="Só previstos"
            description="Lançamentos de recorrências ainda não confirmados."
          />
        </div>
      </Sheet>
    </div>
  );
}
