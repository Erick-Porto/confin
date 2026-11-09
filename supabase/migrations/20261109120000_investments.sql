-- Confin: Fase 4 (patrimônio e investimentos)
--
-- Cada aplicação (CDB, Tesouro, ações...) fica dentro de uma conta do tipo investimento.
-- O valor de mercado é informado de tempos em tempos (investment_values). Aportes, resgates e proventos
-- são lançamentos comuns ligados à aplicação por transactions.investment_id. Os cálculos ficam no app
-- (src/features/investments/portfolio.ts).

create type public.investment_class as enum (
  'fixed_income', 'treasury', 'stocks', 'reits', 'funds', 'crypto', 'pension', 'other'
);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 60),
  class public.investment_class not null,
  -- Posição de abertura: valor de mercado e quanto já estava aplicado nessa data.
  opening_date date not null default public.local_today(),
  opening_value_cents bigint not null default 0 check (opening_value_cents >= 0),
  opening_cost_cents bigint not null default 0 check (opening_cost_cents >= 0),
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index investments_group_idx on public.investments (group_id);
create index investments_account_idx on public.investments (account_id);

-- Valor de mercado informado numa data (um por dia por aplicação).
create table public.investment_values (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  investment_id uuid not null references public.investments (id) on delete cascade,
  date date not null default public.local_today(),
  value_cents bigint not null check (value_cents >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint investment_values_one_per_day unique (investment_id, date)
);
create index investment_values_group_idx on public.investment_values (group_id);

alter table public.transactions
  add column investment_id uuid references public.investments (id) on delete set null;
create index transactions_investment_idx on public.transactions (investment_id);

-- Aplicação só em conta de investimento do grupo; valores só de aplicação do grupo.
create or replace function public.check_investment_refs() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_table_name = 'investments' then
    if not exists (
      select 1 from public.accounts
      where id = new.account_id and group_id = new.group_id and type = 'investment'
    ) then
      raise exception 'Escolha uma conta de investimento do grupo';
    end if;
    if tg_op = 'UPDATE' and new.account_id <> old.account_id
       and exists (select 1 from public.transactions where investment_id = new.id) then
      raise exception 'Esta aplicação já tem lançamentos e não pode mudar de conta';
    end if;
  else
    if not exists (select 1 from public.investments where id = new.investment_id and group_id = new.group_id) then
      raise exception 'Aplicação não pertence ao grupo';
    end if;
  end if;
  return new;
end;
$$;

-- O lançamento só fica ligado a uma aplicação da conta que ele usa (origem ou destino).
-- Se a conta mudou, o vínculo é desfeito em vez de dar erro.
create or replace function public.check_tx_investment() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.investment_id is not null and not exists (
    select 1 from public.investments i
    where i.id = new.investment_id and i.group_id = new.group_id
      and (i.account_id = new.account_id or i.account_id = new.to_account_id)
  ) then
    new.investment_id := null;
  end if;
  return new;
end;
$$;

create trigger investments_10_actor before insert or update on public.investments
  for each row execute function public.set_actor();
create trigger investments_20_refs before insert or update on public.investments
  for each row execute function public.check_investment_refs();
create trigger investments_90_audit after insert or update or delete on public.investments
  for each row execute function public.audit_row();

create trigger investment_values_10_actor before insert or update on public.investment_values
  for each row execute function public.set_actor();
create trigger investment_values_20_refs before insert or update on public.investment_values
  for each row execute function public.check_investment_refs();
create trigger investment_values_90_audit after insert or update or delete on public.investment_values
  for each row execute function public.audit_row();

create trigger transactions_30_investment before insert or update on public.transactions
  for each row execute function public.check_tx_investment();

-- Saldo contábil de cada conta do grupo no fim de cada data pedida (evolução do patrimônio).
-- Mesma conta da view account_balances. Roda com as permissões de quem chama (RLS vale).
create or replace function public.account_balances_at(p_group uuid, p_dates date[])
returns table (as_of date, account_id uuid, balance_cents bigint)
language sql stable security invoker set search_path = public
as $$
  select d.as_of, a.id,
    (a.initial_balance_cents + coalesce((
      select sum(
        case
          when t.type = 'income' then t.amount_cents
          when t.type = 'expense' then -t.amount_cents
          when t.account_id = a.id then -t.amount_cents
          else t.amount_cents
        end)
      from public.transactions t
      where (t.account_id = a.id or t.to_account_id = a.id)
        and t.status = 'posted'
        and t.date <= d.as_of
    ), 0))::bigint
  from unnest(p_dates) as d(as_of)
  cross join public.accounts a
  where a.group_id = p_group;
$$;

revoke execute on function public.account_balances_at(uuid, date[]) from public, anon;
grant execute on function public.account_balances_at(uuid, date[]) to authenticated;

alter table public.investments enable row level security;
alter table public.investment_values enable row level security;
create policy investments_all on public.investments for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy investment_values_all on public.investment_values for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
