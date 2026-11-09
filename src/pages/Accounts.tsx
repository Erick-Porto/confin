import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, Wallet } from 'lucide-react';
import { useAccounts, useInvestmentFlows, useInvestmentValues, useInvestments, useMembers } from '@/hooks/queries';
import { accountMarketValue, portfolio } from '@/features/investments/portfolio';
import { ACCOUNT_TYPE_LABELS, accountLabel } from '@/lib/accounts';
import { AccountForm } from '@/features/accounts/AccountForm';
import { Button, Card, EmptyState, ListItem, Money, PageHeader, SectionTitle, Skeleton } from '@/components/ui';
import type { AccountWithBalance } from '@/types';

export default function Accounts() {
  const accountsQ = useAccounts();
  const membersQ = useMembers();
  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);
  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AccountWithBalance | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const groups = useMemo(() => {
    const active = accounts.filter((a) => !a.archived);
    return {
      regular: active.filter((a) => ['checking', 'savings', 'wallet'].includes(a.type)),
      cards: active.filter((a) => a.type === 'credit_card'),
      investments: active.filter((a) => a.type === 'investment'),
      archived: accounts.filter((a) => a.archived),
    };
  }, [accounts]);

  const totalRegular = groups.regular.reduce((s, a) => s + a.balance_cents, 0);
  const totalBills = groups.cards.reduce((s, a) => s + Math.min(a.balance_cents, 0), 0);
  const totalInvest = groups.investments.reduce((s, a) => s + a.balance_cents, 0);
  const invQ = useInvestments();
  const valuesQ = useInvestmentValues();
  const flowsQ = useInvestmentFlows();
  const marketValue = useMemo(() => {
    const { positions } = portfolio(invQ.data ?? [], valuesQ.data ?? [], flowsQ.data ?? [], accounts);
    return groups.investments.reduce((s, a) => s + accountMarketValue(a.id, a.balance_cents, positions), 0);
  }, [invQ.data, valuesQ.data, flowsQ.data, accounts, groups.investments]);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(a: AccountWithBalance) {
    setEditing(a);
    setFormOpen(true);
  }

  function renderRow(a: AccountWithBalance) {
    const isCard = a.type === 'credit_card';
    const subtitleParts = [a.institution, ACCOUNT_TYPE_LABELS[a.type]].filter(Boolean);
    const subtitle = isCard ? `Fecha dia ${a.closing_day} · vence dia ${a.due_day}` : subtitleParts.join(' · ');
    return (
      <div key={a.id} className="py-1">
        <ListItem
          onClick={() => openEdit(a)}
          leading={<span className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden="true" />}
          title={accountLabel(a, members)}
          subtitle={subtitle}
          trailing={
            <div className="text-right">
              {isCard && <div className="text-xs text-muted">Fatura</div>}
              <Money cents={a.balance_cents} tone="auto" className="text-sm font-semibold" />
            </div>
          }
        />
        <div className="flex gap-1 pb-1 pl-5">
          <Link
            to={`/extrato?conta=${a.id}`}
            className="flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-brand-700 hover:bg-surface-2 dark:text-brand-400"
          >
            Ver extrato
          </Link>
          {isCard && (
            <Link
              to={`/contas/${a.id}/fatura`}
              className="flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-brand-700 hover:bg-surface-2 dark:text-brand-400"
            >
              Ver fatura
            </Link>
          )}
        </div>
      </div>
    );
  }

  function renderSection(title: string, list: AccountWithBalance[]) {
    if (list.length === 0) return null;
    return (
      <section>
        <SectionTitle>{title}</SectionTitle>
        <Card className="divide-y divide-line py-2">{list.map(renderRow)}</Card>
      </section>
    );
  }

  const header = (
    <PageHeader
      title="Contas"
      back="/mais"
      actions={
        <Button size="sm" icon={<Plus size={16} />} onClick={openNew}>
          Nova
        </Button>
      }
    />
  );

  if (accountsQ.isLoading) {
    return (
      <div>
        {header}
        <Skeleton className="h-28" />
        <Skeleton className="mt-4 h-48" />
      </div>
    );
  }

  if (accountsQ.isError) {
    return (
      <div>
        {header}
        <EmptyState
          title="Não foi possível carregar as contas"
          description="Verifique sua conexão e tente de novo."
          action={<Button onClick={() => void accountsQ.refetch()}>Tentar de novo</Button>}
        />
      </div>
    );
  }

  return (
    <div className="pb-6">
      {header}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet size={40} />}
          title="Nenhuma conta ainda"
          description={'Cadastre suas contas e cartões, uma por titular. Ex.: "Erick - Nubank" e "Conjunta - Itaú".'}
          action={<Button onClick={openNew}>Cadastrar primeira conta</Button>}
        />
      ) : (
        <>
          <Card>
            <p className="text-sm text-muted">Saldo em contas</p>
            <Money cents={totalRegular} tone="auto" className="text-3xl font-bold" />
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
              <div>
                <p className="text-xs text-muted">Faturas de cartão</p>
                <Money cents={totalBills} tone="auto" className="text-base font-semibold" />
              </div>
              <div>
                <p className="text-xs text-muted">Investimentos</p>
                <Money cents={totalInvest} className="text-base font-semibold text-invest" />
                {groups.investments.length > 0 && (
                  <p className="text-xs text-muted">
                    Valor de mercado: <Money cents={marketValue} />{' '}
                    <Link to="/investimentos" className="font-medium text-brand-700 dark:text-brand-300">
                      Ver carteira
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </Card>

          {renderSection('Contas', groups.regular)}
          {renderSection('Cartões de crédito', groups.cards)}
          {renderSection('Investimentos', groups.investments)}

          {groups.archived.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={showArchived}
                className="mt-6 flex min-h-11 w-full items-center justify-between px-1 text-sm font-semibold text-muted"
              >
                <span>Arquivadas ({groups.archived.length})</span>
                {showArchived ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {showArchived && <Card className="divide-y divide-line py-2">{groups.archived.map(renderRow)}</Card>}
            </section>
          )}
        </>
      )}

      {formOpen && (
        <AccountForm
          key={editing?.id ?? 'new'}
          account={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
