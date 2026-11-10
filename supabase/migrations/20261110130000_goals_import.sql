-- Confin: Fases 7 (metas) e 8 (importar extratos)

-- -----------------------------------------------------------------------------
-- Metas
-- -----------------------------------------------------------------------------
-- manual: o progresso é o valor guardado informado (saved_cents).
-- account: o progresso é o saldo de uma conta (conta de investimento pelo valor de mercado).
-- investment: o progresso é o valor de uma aplicação.

create type public.goal_kind as enum ('manual', 'account', 'investment');

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind public.goal_kind not null default 'manual',
  target_cents bigint not null check (target_cents > 0),
  target_date date,
  saved_cents bigint not null default 0 check (saved_cents >= 0),
  account_id uuid references public.accounts (id) on delete set null,
  investment_id uuid references public.investments (id) on delete set null,
  color text not null default '#0F766E',
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- O vínculo combina com o tipo (pode ficar nulo se a conta ou aplicação for excluída).
  constraint goals_link check (
    (kind = 'manual' and account_id is null and investment_id is null)
    or (kind = 'account' and investment_id is null)
    or (kind = 'investment' and account_id is null)
  )
);
create index goals_group_idx on public.goals (group_id);

-- Conta e aplicação da meta precisam ser do mesmo grupo.
create or replace function public.check_goal_refs() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.account_id is not null
     and not exists (select 1 from public.accounts where id = new.account_id and group_id = new.group_id) then
    raise exception 'Conta não pertence ao grupo';
  end if;
  if new.investment_id is not null
     and not exists (select 1 from public.investments where id = new.investment_id and group_id = new.group_id) then
    raise exception 'Aplicação não pertence ao grupo';
  end if;
  return new;
end;
$$;

create trigger goals_10_actor before insert or update on public.goals
  for each row execute function public.set_actor();
create trigger goals_20_refs before insert or update on public.goals
  for each row execute function public.check_goal_refs();
create trigger goals_90_audit after insert or update or delete on public.goals
  for each row execute function public.audit_row();

alter table public.goals enable row level security;
create policy goals_all on public.goals for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));

-- -----------------------------------------------------------------------------
-- Importação de extratos
-- -----------------------------------------------------------------------------
-- import_id identifica a linha do arquivo do banco (FITID do OFX ou um resumo da linha do CSV).
-- Importar o mesmo arquivo de novo não duplica: a mesma conta não aceita o mesmo import_id duas vezes.

alter table public.transactions
  add column import_id text check (char_length(import_id) <= 200);
alter table public.transactions
  add constraint transactions_import_unique unique (account_id, import_id);
