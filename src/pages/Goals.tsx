import { useMemo, useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { useAccounts, useInvestments, useMembers } from '@/hooks/queries';
import { useUI } from '@/context/UIContext';
import { Button, Card, ColorDot, EmptyState, Field, Money, PageHeader, Sheet, Skeleton } from '@/components/ui';
import { accountLabel } from '@/lib/accounts';
import { errorMessage } from '@/lib/errors';
import { MoneyField } from '@/features/investments/MoneyField';
import { GoalForm } from '@/features/goals/GoalForm';
import { GOAL_KIND_LABELS, useAdjustGoalSaved, type GoalStatus } from '@/features/goals/goals';
import { useGoalStatuses } from '@/features/goals/useGoalStatuses';
import type { Goal } from '@/types';

function monthYear(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function AdjustSheet({ goal, sign, onClose }: { goal: Goal; sign: 1 | -1; onClose: () => void }) {
  const { toast } = useUI();
  const adjust = useAdjustGoalSaved();
  const [cents, setCents] = useState(0);
  const label = sign > 0 ? 'Guardar' : 'Retirar';
  async function submit() {
    try {
      await adjust.mutateAsync({ goal, deltaCents: sign * cents });
      toast(sign > 0 ? 'Valor guardado' : 'Valor retirado');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    }
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${label} em ${goal.name}`}
      footer={
        <Button disabled={cents <= 0} loading={adjust.isPending} onClick={submit}>
          {label}
        </Button>
      }
    >
      <div className="pt-2">
        <Field label="Valor">{(id) => <MoneyField id={id} cents={cents} onChange={setCents} placeholder="R$ 0,00" />}</Field>
      </div>
    </Sheet>
  );
}

function GoalCard({
  s,
  link,
  onEdit,
  onAdjust,
}: {
  s: GoalStatus;
  link: string | null;
  onEdit: () => void;
  onAdjust: (sign: 1 | -1) => void;
}) {
  const g = s.goal;
  return (
    <Card>
      <button type="button" onClick={onEdit} className="block w-full text-left">
        <div className="flex items-center gap-2">
          <ColorDot color={g.color} />
          <h3 className="min-w-0 flex-1 truncate font-semibold">{g.name}</h3>
          {s.reached && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-income">Alcançada</span>}
          {s.late && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-expense">Atrasada</span>}
          {s.linkMissing && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">Conta removida</span>}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full ${s.reached ? 'bg-income' : 'bg-brand-600'}`} style={{ width: `${s.ratio * 100}%` }} />
        </div>
        <p className="mt-2 text-sm">
          <Money cents={s.current} /> de <Money cents={g.target_cents} />
        </p>
        {!s.reached && (
          <p className="text-xs text-muted">
            Falta <Money cents={s.remaining} />
          </p>
        )}
        {g.target_date && (
          <p className="text-xs text-muted">
            até {monthYear(g.target_date)}
            {s.monthlyNeeded !== null && (
              <>
                {' · Guarde '}
                <Money cents={s.monthlyNeeded} /> por mês
              </>
            )}
          </p>
        )}
        <p className="text-xs text-muted">
          {GOAL_KIND_LABELS[g.kind]}
          {link ? `: ${link}` : ''}
        </p>
      </button>
      {g.kind === 'manual' && !g.archived && (
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => onAdjust(1)}>
            Guardar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onAdjust(-1)}>
            Retirar
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function Goals() {
  const { statuses, isLoading, error } = useGoalStatuses();
  const { data: accounts = [] } = useAccounts();
  const { data: investments = [] } = useInvestments();
  const { data: members = [] } = useMembers();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Goal | null | undefined>(undefined); // undefined = fechado; null = nova
  const [adjust, setAdjust] = useState<{ goal: Goal; sign: 1 | -1 } | null>(null);

  const active = useMemo(() => statuses.filter((s) => !s.goal.archived), [statuses]);
  const archived = useMemo(() => statuses.filter((s) => s.goal.archived), [statuses]);

  const linkName = (g: Goal): string | null => {
    if (g.kind === 'account') {
      const a = accounts.find((x) => x.id === g.account_id);
      return a ? accountLabel(a, members) : null;
    }
    if (g.kind === 'investment') return investments.find((i) => i.id === g.investment_id)?.name ?? null;
    return null;
  };

  const card = (s: GoalStatus) => (
    <GoalCard
      key={s.goal.id}
      s={s}
      link={linkName(s.goal)}
      onEdit={() => setEditing(s.goal)}
      onAdjust={(sign) => setAdjust({ goal: s.goal, sign })}
    />
  );

  return (
    <div className="pb-6">
      <PageHeader
        title="Metas"
        back
        actions={
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
            <Plus size={18} /> Nova meta
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        {error ? (
          <Card>
            <EmptyState title="Não foi possível carregar" description={errorMessage(error)} />
          </Card>
        ) : isLoading ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : statuses.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Target size={32} />}
              title="Nenhuma meta ainda"
              description="Defina um objetivo, como Reserva de emergência ou Viagem, e acompanhe o quanto falta."
              action={<Button onClick={() => setEditing(null)}>Nova meta</Button>}
            />
          </Card>
        ) : (
          <>
            {active.map(card)}
            {archived.length > 0 && (
              <>
                <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? 'Ocultar arquivadas' : `Mostrar arquivadas (${archived.length})`}
                </Button>
                {showArchived && archived.map(card)}
              </>
            )}
          </>
        )}
      </div>
      {editing !== undefined && <GoalForm key={editing?.id ?? 'new'} goal={editing} onClose={() => setEditing(undefined)} />}
      {adjust && <AdjustSheet goal={adjust.goal} sign={adjust.sign} onClose={() => setAdjust(null)} />}
    </div>
  );
}
