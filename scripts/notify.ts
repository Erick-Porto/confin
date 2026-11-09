/**
 * Job diário de avisos (GitHub Actions: .github/workflows/notify.yml).
 *
 * Lê o banco direto pelo pooler do Supabase (com a senha do banco), calcula com as mesmas regras do app
 * e envia Web Push para os aparelhos inscritos. Aviso já enviado não se repete (notification_log).
 *
 * - Contas (preferência notify_bills): previstos que vencem hoje ou amanhã, previstos atrasados (até 30 dias)
 *   e faturas de cartão que vencem hoje ou amanhã.
 * - Plano e orçamento (notify_budget): blocos do plano e orçamentos de categoria a partir de 80% ou estourados.
 *
 * Ambiente: DATABASE_URL (sem senha), SUPABASE_DB_PASSWORD, VAPID_PRIVATE_KEY, APP_URL e TZ=America/Sao_Paulo.
 */
import pg from 'pg';
import * as webpush from 'web-push';
import { addDays } from 'date-fns';
import type { Account, Category, PlanBlock, Transaction } from '../src/types';
import { formatCents, formatDate, parseISODate, todayISO, toISODate } from '../src/lib/format';
import { getPeriod } from '../src/lib/period';
import { PLAN_ALERT_RATIO, planAlerts, planSummary } from '../src/features/planning/plan';
import { budgetStatuses } from '../src/features/dashboard/aggregate';
import { currentStatementClosing, shiftStatement, statementDueDate } from '../src/lib/card';
import { VAPID_PUBLIC_KEY } from '../src/lib/vapid';

// date → 'YYYY-MM-DD' (sem fuso); bigint → número (centavos cabem com folga).
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(20, (v: string) => Number(v));

interface Sub {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  notify_bills: boolean;
  notify_budget: boolean;
}

interface Message {
  key: string;
  line: string;
}

const MAX_LINES = 4;

function body(messages: Message[]): string {
  const lines = messages.slice(0, MAX_LINES).map((m) => m.line);
  if (messages.length > MAX_LINES) lines.push(`e mais ${messages.length - MAX_LINES}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const { DATABASE_URL, SUPABASE_DB_PASSWORD, VAPID_PRIVATE_KEY, APP_URL } = process.env;
  if (!VAPID_PRIVATE_KEY) {
    console.log('::warning::O secret VAPID_PRIVATE_KEY não está cadastrado; nenhum aviso foi enviado.');
    return;
  }
  if (!DATABASE_URL || !SUPABASE_DB_PASSWORD || !APP_URL) throw new Error('Faltam DATABASE_URL, SUPABASE_DB_PASSWORD ou APP_URL.');
  webpush.setVapidDetails(APP_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const url = new URL(DATABASE_URL);
  url.password = SUPABASE_DB_PASSWORD;
  // O pooler usa certificado da CA própria do Supabase: a conexão é criptografada, sem validar a cadeia.
  const db = new pg.Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    const today = todayISO();
    const tomorrow = toISODate(addDays(parseISODate(today), 1));
    const lateFrom = toISODate(addDays(parseISODate(today), -30));

    const { rows: subs } = await db.query<Sub>(
      `select s.id, s.user_id, s.endpoint, s.p256dh, s.auth, p.notify_bills, p.notify_budget
         from public.push_subscriptions s join public.profiles p on p.id = s.user_id`,
    );
    if (subs.length === 0) {
      console.log('Nenhum aparelho inscrito.');
      return;
    }
    if (process.env.NOTIFY_TEST === 'true') {
      // Disparo manual de teste: um aviso simples para todos os aparelhos inscritos, sem registrar no log.
      const payload = JSON.stringify({
        title: 'Confin',
        body: 'Notificação de teste: os avisos estão funcionando neste aparelho.',
        url: APP_URL,
        tag: 'confin-teste',
      });
      let ok = 0;
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          ok++;
        } catch (err) {
          console.log(`::warning::Falha no teste (HTTP ${(err as { statusCode?: number }).statusCode ?? 'sem resposta'}).`);
        }
      }
      console.log(`Teste enviado para ${ok} de ${subs.length} aparelho(s).`);
      return;
    }
    const userIds = [...new Set(subs.map((s) => s.user_id))];
    const { rows: memberships } = await db.query<{ group_id: string; user_id: string; name: string; month_start_day: number }>(
      `select gm.group_id, gm.user_id, g.name, g.month_start_day
         from public.group_members gm join public.groups g on g.id = gm.group_id
        where gm.user_id = any($1::uuid[])`,
      [userIds],
    );

    const gone = new Set<string>();
    let sent = 0;

    for (const groupId of new Set(memberships.map((m) => m.group_id))) {
      const members = memberships.filter((m) => m.group_id === groupId);
      const { name, month_start_day } = members[0];
      const period = getPeriod(today, month_start_day);

      const [txs, categories, accounts, blocks, bills] = await Promise.all([
        db.query<Transaction>('select * from public.transactions where group_id = $1 and date between $2 and $3', [
          groupId,
          period.start,
          period.end,
        ]),
        db.query<Category>('select * from public.categories where group_id = $1', [groupId]),
        db.query<Account>('select * from public.accounts where group_id = $1', [groupId]),
        db.query<PlanBlock>('select * from public.plan_blocks where group_id = $1 order by sort_order', [groupId]),
        db.query<Transaction>(
          `select * from public.transactions
            where group_id = $1 and status = 'planned' and type <> 'transfer' and date between $2 and $3
            order by date`,
          [groupId, lateFrom, tomorrow],
        ),
      ]);

      const budgetMsgs: Message[] = [];
      if (blocks.rows.length > 0) {
        const summary = planSummary(txs.rows, blocks.rows, categories.rows, accounts.rows, today);
        for (const s of planAlerts(summary)) {
          budgetMsgs.push({
            key: `plan:${s.block.id}:${period.key}:${s.level}`,
            line:
              s.level === 'over'
                ? `${s.block.name}: passou ${formatCents(s.done - s.planned)} do plano`
                : `${s.block.name}: ${Math.round(s.ratio * 100)}% do plano usado`,
          });
        }
      }
      for (const b of budgetStatuses(txs.rows, categories.rows, today)) {
        if (b.ratio < PLAN_ALERT_RATIO) continue;
        const level = b.spent > b.budget ? 'over' : 'warning';
        budgetMsgs.push({
          key: `budget:${b.category.id}:${period.key}:${level}`,
          line:
            level === 'over'
              ? `${b.category.name}: passou ${formatCents(b.spent - b.budget)} do orçamento`
              : `${b.category.name}: ${Math.round(b.ratio * 100)}% do orçamento usado`,
        });
      }

      const billMsgs = new Map<string, string>();
      for (const tx of bills.rows) {
        const state = tx.date < today ? 'late' : tx.date === today ? 'today' : 'tomorrow';
        const when = state === 'late' ? `venceu em ${formatDate(tx.date)}` : state === 'today' ? 'vence hoje' : 'vence amanhã';
        const verb = tx.type === 'income' ? 'Receber' : 'Pagar';
        billMsgs.set(`tx:${tx.id}:${state}`, `${verb} ${tx.description || 'lançamento previsto'}: ${formatCents(tx.amount_cents)}, ${when}`);
      }
      for (const card of accounts.rows) {
        if (card.type !== 'credit_card' || card.archived || !card.closing_day || !card.due_day) continue;
        const current = currentStatementClosing(card, today);
        for (const n of [-1, 0]) {
          const due = statementDueDate(card, shiftStatement(card, current, n));
          if (due === today || due === tomorrow) {
            billMsgs.set(`card:${card.id}:${due}`, `Fatura ${card.name}: ${due === today ? 'vence hoje' : 'vence amanhã'}`);
          }
        }
      }

      for (const { user_id: userId } of members) {
        const userSubs = subs.filter((s) => s.user_id === userId && !gone.has(s.id));
        if (userSubs.length === 0) continue;
        const { notify_bills, notify_budget } = userSubs[0];
        const candidates: Array<{ title: string; url: string; tag: string; messages: Message[] }> = [];
        if (notify_bills && billMsgs.size > 0) {
          candidates.push({
            title: `Contas · ${name}`,
            url: `${APP_URL}#/agenda`,
            tag: `confin-contas-${groupId}`,
            messages: [...billMsgs].map(([key, line]) => ({ key, line })),
          });
        }
        if (notify_budget && budgetMsgs.length > 0) {
          candidates.push({ title: `Plano do mês · ${name}`, url: `${APP_URL}#/planejamento`, tag: `confin-plano-${groupId}`, messages: budgetMsgs });
        }

        for (const c of candidates) {
          const { rows: already } = await db.query<{ key: string }>(
            'select key from public.notification_log where user_id = $1 and key = any($2::text[])',
            [userId, c.messages.map((m) => m.key)],
          );
          const done = new Set(already.map((r) => r.key));
          const fresh = c.messages.filter((m) => !done.has(m.key));
          if (fresh.length === 0) continue;

          const payload = JSON.stringify({ title: c.title, body: body(fresh), url: c.url, tag: c.tag });
          let delivered = false;
          for (const s of userSubs) {
            if (gone.has(s.id)) continue;
            try {
              await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
                TTL: 12 * 3600,
              });
              delivered = true;
            } catch (err) {
              const status = (err as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) {
                // Aparelho cancelou a inscrição ou o navegador a expirou.
                await db.query('delete from public.push_subscriptions where id = $1', [s.id]);
                gone.add(s.id);
              } else {
                console.log(`::warning::Falha ao enviar um aviso (HTTP ${status ?? 'sem resposta'}).`);
              }
            }
          }
          if (delivered) {
            await db.query(
              'insert into public.notification_log (user_id, key) select $1, unnest($2::text[]) on conflict do nothing',
              [userId, fresh.map((m) => m.key)],
            );
            sent++;
          }
        }
      }
    }

    await db.query(`delete from public.notification_log where sent_at < now() - interval '120 days'`);
    console.log(`Avisos enviados: ${sent}. Inscrições expiradas removidas: ${gone.size}.`);
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
