import { useEffect, useState } from 'react';
import { Button, Field, Input, Select, Sheet } from '@/components/ui';
import { useAccounts, useMembers } from '@/hooks/queries';
import { useGroupId } from '@/context/GroupContext';
import { useUI } from '@/context/UIContext';
import { useMonthStartDay } from '@/components/PeriodSwitcher';
import { supabase } from '@/lib/supabase';
import { accountLabel, sortAccounts } from '@/lib/accounts';
import { errorMessage } from '@/lib/errors';
import { todayISO } from '@/lib/format';
import { getPeriod } from '@/lib/period';
import type { AccountBalanceAt, Transaction } from '@/types';
import { transactionsToOfx } from './ofx';
import { downloadFile } from './report';

/** Exporta o extrato de uma conta, num período, em OFX. */
export function ExportOfxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groupId = useGroupId();
  const { toast } = useUI();
  const startDay = useMonthStartDay();
  const { data: accounts = [] } = useAccounts();
  const { data: members = [] } = useMembers();
  const active = sortAccounts(accounts.filter((a) => !a.archived));
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const p = getPeriod(todayISO(), startDay);
    setFrom(p.start);
    setTo(p.end);
  }, [open, startDay]);

  const selected = accountId || active[0]?.id || '';
  const valid = !!selected && !!from && !!to && from <= to;

  const run = async () => {
    const account = accounts.find((a) => a.id === selected);
    if (!account || !valid) return;
    setBusy(true);
    try {
      const txs: Transaction[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('group_id', groupId)
          .or(`account_id.eq.${account.id},to_account_id.eq.${account.id}`)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + 999);
        if (error) throw error;
        const page = (data as Transaction[]).map((t) => ({ ...t, amount_cents: Number(t.amount_cents) }));
        txs.push(...page);
        if (page.length < 1000) break;
      }
      // Saldo no fim do período (a RPC só considera efetivados; não passa de hoje).
      const today = todayISO();
      const { data: bal, error: balErr } = await supabase.rpc('account_balances_at', {
        p_group: groupId,
        p_dates: [to < today ? to : today],
      });
      if (balErr) throw balErr;
      const row = (bal as AccountBalanceAt[]).find((r) => r.account_id === account.id);
      const balance = row ? Number(row.balance_cents) : account.initial_balance_cents;
      const text = transactionsToOfx(account, txs, { from, to }, balance);
      const safe = account.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase();
      downloadFile(`confin-${safe || 'conta'}-${from}-${to}.ofx`, text, 'application/x-ofx');
      toast('Extrato exportado');
      onClose();
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Exportar extrato (OFX)"
      footer={
        <Button block loading={busy} disabled={!valid} onClick={() => void run()}>
          Baixar OFX
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Conta">
          {(id) => (
            <Select id={id} value={selected} onChange={(e) => setAccountId(e.target.value)}>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a, members)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="De">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Até" error={from && to && from > to ? 'Data final antes da inicial' : undefined}>
            {(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
          </Field>
        </div>
        <p className="text-xs text-muted">Só lançamentos efetivados entram no arquivo.</p>
      </div>
    </Sheet>
  );
}
