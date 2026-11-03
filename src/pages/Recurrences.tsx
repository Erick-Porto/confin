import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Plus, Repeat } from 'lucide-react';
import { Button, Card, EmptyState, Money, PageHeader, SectionTitle, Skeleton, TxAmount } from '@/components/ui';
import { useAccounts, useCategories, useMembers, useRecurrences } from '@/hooks/queries';
import { accountLabel } from '@/lib/accounts';
import { formatShortDate } from '@/lib/format';
import { CategoryIcon } from '@/lib/icons';
import { RecurrenceForm } from '@/features/recurrences/RecurrenceForm';
import { describeRule, monthlyEquivalentCents, nextOccurrence } from '@/features/recurrences/schedule';
import type { Recurrence } from '@/types';

export default function Recurrences() {
  const [params, setParams] = useSearchParams();
  const { data: recurrences = [], isLoading, isError, refetch } = useRecurrences();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: members = [] } = useMembers();
  const [form, setForm] = useState<{ recurrence: Recurrence | null } | null>(null);

  useEffect(() => {
    if (params.get('nova') === '1') {
      setForm({ recurrence: null });
      const next = new URLSearchParams(params);
      next.delete('nova');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const { active, paused, income, expense } = useMemo(() => {
    const act = recurrences.filter((r) => r.active);
    let inc = 0;
    let exp = 0;
    for (const r of act) {
      if (r.type === 'income') inc += monthlyEquivalentCents(r);
      else if (r.type === 'expense') exp += monthlyEquivalentCents(r);
    }
    return { active: act, paused: recurrences.filter((r) => !r.active), income: inc, expense: exp };
  }, [recurrences]);

  const renderRow = (rec: Recurrence) => {
    const category = rec.category_id ? categories.find((c) => c.id === rec.category_id) : undefined;
    const account = accounts.find((a) => a.id === rec.account_id);
    const next = rec.active ? nextOccurrence(rec) : null;
    return (
      <button
        key={rec.id}
        type="button"
        onClick={() => setForm({ recurrence: rec })}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition hover:bg-surface-2"
      >
        {rec.type === 'transfer' ? (
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-transfer/12 text-transfer">
            <ArrowLeftRight size={18} />
          </span>
        ) : (
          <CategoryIcon name={category?.icon} color={category?.color} size={40} />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{rec.description}</div>
          <div className="truncate text-xs text-muted">
            {describeRule(rec)} · {account ? accountLabel(account, members) : 'Conta'}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <TxAmount type={rec.type} cents={rec.amount_cents} className="text-sm font-semibold" />
          <span className="text-xs text-muted">
            {!rec.active ? 'Pausada' : next ? `Próxima: ${formatShortDate(next)}` : 'Encerrada'}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="pb-6">
      <PageHeader
        title="Recorrências"
        back="/mais"
        actions={
          <Button size="sm" icon={<Plus size={16} />} onClick={() => setForm({ recurrence: null })}>
            Nova
          </Button>
        }
      />
      <p className="mb-4 px-1 text-sm text-muted">
        Lançamentos que se repetem viram previstos automaticamente até 60 dias à frente. Você confirma quando acontecerem.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <EmptyState
          title="Não foi possível carregar as recorrências"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : recurrences.length === 0 ? (
        <EmptyState
          icon={<Repeat size={32} />}
          title="Nenhuma recorrência ainda"
          description="Cadastre aluguel, salário, assinaturas e outros lançamentos fixos."
          action={<Button onClick={() => setForm({ recurrence: null })}>Nova recorrência</Button>}
        />
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted">Entradas fixas</div>
              <div className="text-base font-semibold">
                <Money cents={income} tone="income" />
                <span className="text-xs font-normal text-muted">/mês</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Saídas fixas</div>
              <div className="text-base font-semibold">
                <Money cents={expense} tone="expense" />
                <span className="text-xs font-normal text-muted">/mês</span>
              </div>
            </div>
          </Card>

          <SectionTitle>Ativas</SectionTitle>
          {active.length > 0 ? (
            <Card className="p-2">{active.map(renderRow)}</Card>
          ) : (
            <p className="px-1 text-sm text-muted">Nenhuma recorrência ativa.</p>
          )}

          {paused.length > 0 && (
            <>
              <SectionTitle>Pausadas</SectionTitle>
              <Card className="p-2 opacity-80">{paused.map(renderRow)}</Card>
            </>
          )}
        </>
      )}

      {form && <RecurrenceForm recurrence={form.recurrence} onClose={() => setForm(null)} />}
    </div>
  );
}
