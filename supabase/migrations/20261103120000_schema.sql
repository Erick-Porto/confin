-- =============================================================================
-- Confin: esquema inicial (Fases 0, 1 e 2)
-- Regras principais:
--   * Toda tabela financeira tem group_id; o RLS só libera linhas dos grupos do usuário.
--   * Valores em centavos (bigint), sempre positivos; o tipo diz se soma ou subtrai.
--   * Saldo = saldo inicial + lançamentos com status 'posted' e data <= hoje (fuso de São Paulo).
--   * Transferência é um lançamento só (conta de origem e destino) e não tem categoria.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'member');
create type public.account_type as enum ('checking', 'savings', 'wallet', 'credit_card', 'investment');
create type public.category_kind as enum ('income', 'expense');
create type public.tx_type as enum ('income', 'expense', 'transfer');
create type public.tx_status as enum ('planned', 'posted');
create type public.recurrence_freq as enum ('weekly', 'monthly', 'yearly');

-- Data de hoje no fuso da família (o servidor roda em UTC).
create or replace function public.local_today() returns date
language sql stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 80),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  currency text not null default 'BRL',
  month_start_day smallint not null default 1 check (month_start_day between 1 and 28),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index group_invites_group_idx on public.group_invites (group_id);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete set null, -- null = conta conjunta
  name text not null check (char_length(name) between 1 and 60),
  institution text check (char_length(institution) <= 60),
  type public.account_type not null default 'checking',
  initial_balance_cents bigint not null default 0,
  color text not null default '#0F766E',
  archived boolean not null default false,
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  credit_limit_cents bigint check (credit_limit_cents >= 0),
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint accounts_card_days check (
    type <> 'credit_card' or (closing_day is not null and due_day is not null)
  )
);
create index accounts_group_idx on public.accounts (group_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  parent_id uuid references public.categories (id) on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  kind public.category_kind not null,
  icon text not null default 'tag',
  color text not null default '#64748B',
  monthly_budget_cents bigint check (monthly_budget_cents > 0),
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint categories_not_own_parent check (parent_id is null or parent_id <> id)
);
create index categories_group_idx on public.categories (group_id);

create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  type public.tx_type not null,
  amount_cents bigint not null check (amount_cents > 0),
  description text not null check (char_length(description) between 1 and 120),
  account_id uuid not null references public.accounts (id) on delete cascade,
  to_account_id uuid references public.accounts (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  freq public.recurrence_freq not null default 'monthly',
  interval_count smallint not null default 1 check (interval_count between 1 and 12),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  generated_until date, -- última data já gerada como lançamento previsto
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint recurrences_transfer check ((type = 'transfer') = (to_account_id is not null)),
  constraint recurrences_transfer_accounts check (to_account_id is null or to_account_id <> account_id),
  constraint recurrences_transfer_no_category check (type <> 'transfer' or category_id is null),
  constraint recurrences_dates check (end_date is null or end_date >= start_date)
);
create index recurrences_group_idx on public.recurrences (group_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  type public.tx_type not null,
  status public.tx_status not null default 'posted',
  amount_cents bigint not null check (amount_cents > 0),
  date date not null default public.local_today(),
  description text not null default '' check (char_length(description) <= 120),
  notes text check (char_length(notes) <= 1000),
  account_id uuid not null references public.accounts (id) on delete restrict,
  to_account_id uuid references public.accounts (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  recurrence_id uuid references public.recurrences (id) on delete set null,
  installment_group_id uuid,
  installment_number smallint,
  installment_total smallint,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint transactions_transfer check ((type = 'transfer') = (to_account_id is not null)),
  constraint transactions_transfer_accounts check (to_account_id is null or to_account_id <> account_id),
  constraint transactions_transfer_no_category check (type <> 'transfer' or category_id is null),
  constraint transactions_installments check (
    (installment_group_id is null and installment_number is null and installment_total is null)
    or (
      installment_group_id is not null
      and installment_total between 2 and 72
      and installment_number between 1 and installment_total
    )
  )
);
create index transactions_group_date_idx on public.transactions (group_id, date desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_recurrence_idx on public.transactions (recurrence_id);
create index transactions_installment_idx on public.transactions (installment_group_id);

-- Sem FK em group_id: o histórico não pode travar a exclusão em cascata de um grupo.
create table public.audit_log (
  id bigint generated always as identity primary key,
  group_id uuid not null,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);
create index audit_log_group_idx on public.audit_log (group_id, created_at desc);
create index audit_log_record_idx on public.audit_log (record_id);

-- -----------------------------------------------------------------------------
-- Funções de apoio ao RLS
-- -----------------------------------------------------------------------------
create or replace function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members where group_id = g and user_id = auth.uid()
  );
$$;

create or replace function public.is_owner(g uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid() and role = 'owner'
  );
$$;

-- -----------------------------------------------------------------------------
-- Gatilhos genéricos
-- -----------------------------------------------------------------------------

-- Autor e datas preenchidos pelo banco, nunca confiando no que o app envia.
create or replace function public.set_actor() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.updated_by := new.created_by;
    new.updated_at := now();
  else
    if new.group_id is distinct from old.group_id then
      raise exception 'Não é possível mover um registro para outro grupo';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Histórico de alterações (quem criou, alterou ou excluiu o quê).
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  j_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  j_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  j jsonb := coalesce(j_new, j_old);
  gid uuid := (j ->> 'group_id')::uuid;
  rid uuid := coalesce(j ->> 'id', j ->> 'user_id')::uuid;
begin
  -- Grupo sendo excluído: nada a registrar.
  if not exists (select 1 from public.groups where id = gid) then
    return null;
  end if;
  -- Ignora atualizações que só mexem em campos técnicos (ex.: geração diária de recorrências).
  if tg_op = 'UPDATE'
     and (j_old - 'updated_at' - 'updated_by' - 'generated_until')
       = (j_new - 'updated_at' - 'updated_by' - 'generated_until') then
    return null;
  end if;
  insert into public.audit_log (group_id, table_name, record_id, action, old_data, new_data, user_id)
  values (gid, tg_table_name, rid, lower(tg_op), j_old, j_new, auth.uid());
  return null;
end;
$$;

-- Lançamentos e recorrências só podem usar contas e categorias do próprio grupo.
create or replace function public.check_finance_refs() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.accounts where id = new.account_id and group_id = new.group_id) then
    raise exception 'Conta não pertence ao grupo';
  end if;
  if new.to_account_id is not null
     and not exists (select 1 from public.accounts where id = new.to_account_id and group_id = new.group_id) then
    raise exception 'Conta de destino não pertence ao grupo';
  end if;
  if new.category_id is not null then
    if not exists (
      select 1 from public.categories
      where id = new.category_id and group_id = new.group_id and kind::text = new.type::text
    ) then
      raise exception 'Categoria inválida para este lançamento';
    end if;
  end if;
  if tg_table_name = 'transactions' then
    if new.recurrence_id is not null
       and not exists (select 1 from public.recurrences where id = new.recurrence_id and group_id = new.group_id) then
      raise exception 'Recorrência não pertence ao grupo';
    end if;
  end if;
  return new;
end;
$$;

-- Titular da conta precisa ser membro do grupo.
create or replace function public.check_account_owner() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.owner_id is not null
     and not exists (select 1 from public.group_members where group_id = new.group_id and user_id = new.owner_id) then
    raise exception 'O titular precisa ser membro do grupo';
  end if;
  return new;
end;
$$;

-- Subcategoria: mesmo grupo, mesmo tipo e apenas um nível.
create or replace function public.check_category_parent() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.parent_id is not null then
    if not exists (
      select 1 from public.categories
      where id = new.parent_id and group_id = new.group_id and kind = new.kind and parent_id is null
    ) then
      raise exception 'Categoria pai inválida';
    end if;
    if exists (select 1 from public.categories where parent_id = new.id) then
      raise exception 'Uma categoria com subcategorias não pode virar subcategoria';
    end if;
  end if;
  return new;
end;
$$;

-- O grupo nunca fica sem dono.
create or replace function public.protect_last_owner() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Grupo sendo excluído (cascata): não há o que proteger.
  if exists (select 1 from public.groups where id = old.group_id)
     and old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.group_members
       where group_id = old.group_id and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'O grupo precisa de pelo menos um dono';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Recorrências: ao criar, só gera de hoje em diante; ao mudar, refaz os previstos futuros.
create or replace function public.recurrence_before_write() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.generated_until := coalesce(new.generated_until, greatest(new.start_date, public.local_today()) - 1);
    return new;
  end if;

  if (new.type, new.amount_cents, new.description, new.account_id, new.to_account_id, new.category_id,
      new.freq, new.interval_count, new.start_date, new.end_date, new.active)
     is distinct from
     (old.type, old.amount_cents, old.description, old.account_id, old.to_account_id, old.category_id,
      old.freq, old.interval_count, old.start_date, old.end_date, old.active) then
    delete from public.transactions
    where recurrence_id = new.id and status = 'planned' and date >= public.local_today();
    new.generated_until := least(coalesce(old.generated_until, public.local_today() - 1), public.local_today() - 1);
  end if;
  return new;
end;
$$;

create or replace function public.recurrence_before_delete() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.transactions where recurrence_id = old.id and status = 'planned';
  return old;
end;
$$;

-- Perfil criado no cadastro.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 80), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Quem sai do grupo deixa de ser titular das contas dele (viram conjuntas).
create or replace function public.release_member_accounts() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.groups where id = old.group_id) then
    update public.accounts set owner_id = null
    where group_id = old.group_id and owner_id = old.user_id;
  end if;
  return null;
end;
$$;

create or replace function public.cleanup_group_audit() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.audit_log where group_id = old.id;
  return old;
end;
$$;

-- Gatilhos (disparam em ordem alfabética do nome)
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger groups_90_cleanup after delete on public.groups
  for each row execute function public.cleanup_group_audit();

create trigger group_members_10_owner before update or delete on public.group_members
  for each row execute function public.protect_last_owner();
create trigger group_members_20_release after delete on public.group_members
  for each row execute function public.release_member_accounts();
create trigger group_members_90_audit after insert or update or delete on public.group_members
  for each row execute function public.audit_row();

create trigger accounts_10_actor before insert or update on public.accounts
  for each row execute function public.set_actor();
create trigger accounts_20_owner before insert or update on public.accounts
  for each row execute function public.check_account_owner();
create trigger accounts_90_audit after insert or update or delete on public.accounts
  for each row execute function public.audit_row();

create trigger categories_10_actor before insert or update on public.categories
  for each row execute function public.set_actor();
create trigger categories_20_parent before insert or update on public.categories
  for each row execute function public.check_category_parent();
create trigger categories_90_audit after insert or update or delete on public.categories
  for each row execute function public.audit_row();

create trigger recurrences_10_actor before insert or update on public.recurrences
  for each row execute function public.set_actor();
create trigger recurrences_20_refs before insert or update on public.recurrences
  for each row execute function public.check_finance_refs();
create trigger recurrences_30_write before insert or update on public.recurrences
  for each row execute function public.recurrence_before_write();
create trigger recurrences_40_delete before delete on public.recurrences
  for each row execute function public.recurrence_before_delete();
create trigger recurrences_90_audit after insert or update or delete on public.recurrences
  for each row execute function public.audit_row();

create trigger transactions_10_actor before insert or update on public.transactions
  for each row execute function public.set_actor();
create trigger transactions_20_refs before insert or update on public.transactions
  for each row execute function public.check_finance_refs();
create trigger transactions_90_audit after insert or update or delete on public.transactions
  for each row execute function public.audit_row();

-- -----------------------------------------------------------------------------
-- Saldos
-- -----------------------------------------------------------------------------
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.group_id,
  (a.initial_balance_cents + coalesce((
    select sum(
      case
        when t.type = 'income' then t.amount_cents
        when t.type = 'expense' then -t.amount_cents
        when t.account_id = a.id then -t.amount_cents  -- transferência saindo
        else t.amount_cents                             -- transferência entrando
      end)
    from public.transactions t
    where (t.account_id = a.id or t.to_account_id = a.id)
      and t.status = 'posted'
      and t.date <= public.local_today()
  ), 0))::bigint as balance_cents
from public.accounts a;

-- -----------------------------------------------------------------------------
-- RPCs (chamadas pelo app via supabase.rpc)
-- -----------------------------------------------------------------------------
create or replace function public.seed_default_categories(g uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  moradia uuid;
  alimentacao uuid;
  transporte uuid;
begin
  insert into public.categories (group_id, name, kind, icon, color, sort_order)
  values (g, 'Moradia', 'expense', 'house', '#0F766E', 10) returning id into moradia;
  insert into public.categories (group_id, name, kind, icon, color, sort_order)
  values (g, 'Alimentação', 'expense', 'utensils', '#EA580C', 20) returning id into alimentacao;
  insert into public.categories (group_id, name, kind, icon, color, sort_order)
  values (g, 'Transporte', 'expense', 'car', '#2563EB', 30) returning id into transporte;

  insert into public.categories (group_id, parent_id, name, kind, icon, color, sort_order) values
    (g, moradia, 'Aluguel', 'expense', 'key-round', '#0F766E', 11),
    (g, moradia, 'Contas da casa', 'expense', 'zap', '#0F766E', 12),
    (g, alimentacao, 'Mercado', 'expense', 'shopping-cart', '#EA580C', 21),
    (g, alimentacao, 'Restaurantes e delivery', 'expense', 'utensils', '#EA580C', 22),
    (g, transporte, 'Combustível', 'expense', 'fuel', '#2563EB', 31),
    (g, transporte, 'App e táxi', 'expense', 'smartphone', '#2563EB', 32);

  insert into public.categories (group_id, name, kind, icon, color, sort_order) values
    (g, 'Saúde', 'expense', 'heart-pulse', '#DC2626', 40),
    (g, 'Educação', 'expense', 'graduation-cap', '#7C3AED', 50),
    (g, 'Lazer', 'expense', 'party-popper', '#DB2777', 60),
    (g, 'Assinaturas', 'expense', 'repeat', '#0891B2', 70),
    (g, 'Vestuário', 'expense', 'shirt', '#CA8A04', 80),
    (g, 'Pets', 'expense', 'paw-print', '#65A30D', 90),
    (g, 'Presentes', 'expense', 'gift', '#E11D48', 100),
    (g, 'Impostos e taxas', 'expense', 'receipt', '#475569', 110),
    (g, 'Outros', 'expense', 'ellipsis', '#64748B', 900),
    (g, 'Salário', 'income', 'wallet', '#16A34A', 10),
    (g, 'Freelance', 'income', 'briefcase', '#059669', 20),
    (g, 'Rendimentos', 'income', 'trending-up', '#D97706', 30),
    (g, 'Reembolso', 'income', 'undo-2', '#0D9488', 40),
    (g, 'Outros', 'income', 'circle-plus', '#64748B', 900);
end;
$$;

-- Cria o grupo, coloca quem criou como dono e cadastra as categorias padrão.
create or replace function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  g uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  insert into public.groups (name, created_by) values (trim(p_name), auth.uid()) returning id into g;
  insert into public.group_members (group_id, user_id, role) values (g, auth.uid(), 'owner');
  perform public.seed_default_categories(g);
  return g;
end;
$$;

-- Gera um código de convite de 8 caracteres, uso único, válido por 7 dias.
create or replace function public.create_invite(p_group uuid) returns text
language plpgsql security definer set search_path = public
as $$
declare
  c text;
begin
  if not public.is_owner(p_group) then
    raise exception 'Apenas o dono do grupo pode convidar';
  end if;
  loop
    c := upper(substr(regexp_replace(
      encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'),
      '[^A-Za-z2-9]|[IiLlOo]', '', 'g'), 1, 8));
    exit when char_length(c) = 8 and not exists (select 1 from public.group_invites where code = c);
  end loop;
  insert into public.group_invites (group_id, code, created_by) values (p_group, c, auth.uid());
  return c;
end;
$$;

-- Entra no grupo usando um código de convite. Retorna o id do grupo.
create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  inv public.group_invites;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  select * into inv from public.group_invites where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'Convite inválido';
  end if;
  if exists (select 1 from public.group_members where group_id = inv.group_id and user_id = auth.uid()) then
    return inv.group_id;
  end if;
  if inv.used_by is not null then
    raise exception 'Este convite já foi usado';
  end if;
  if inv.expires_at < now() then
    raise exception 'Este convite expirou';
  end if;
  insert into public.group_members (group_id, user_id, role) values (inv.group_id, auth.uid(), 'member');
  update public.group_invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return inv.group_id;
end;
$$;

-- Gera os lançamentos previstos das recorrências até p_horizon_days à frente.
-- Pelo app: p_group obrigatório e o usuário precisa ser membro. Pelo pg_cron: p_group nulo = todos.
create or replace function public.generate_recurrences(p_group uuid default null, p_horizon_days integer default 60)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r public.recurrences;
  n integer;
  d date;
  last_d date;
  horizon date := public.local_today() + least(greatest(p_horizon_days, 1), 400);
  created integer := 0;
begin
  if auth.uid() is not null and (p_group is null or not public.is_member(p_group)) then
    raise exception 'Sem permissão para este grupo';
  end if;

  for r in
    select * from public.recurrences
    where active and (p_group is null or group_id = p_group)
    for update
  loop
    n := 0;
    last_d := r.generated_until;
    loop
      d := (r.start_date + case r.freq
              when 'weekly' then make_interval(weeks => n * r.interval_count)
              when 'monthly' then make_interval(months => n * r.interval_count)
              else make_interval(years => n * r.interval_count)
            end)::date;
      exit when d > horizon or (r.end_date is not null and d > r.end_date) or n > 5000;
      if r.generated_until is null or d > r.generated_until then
        insert into public.transactions (
          group_id, type, status, amount_cents, date, description,
          account_id, to_account_id, category_id, recurrence_id, created_by
        ) values (
          r.group_id, r.type, 'planned', r.amount_cents, d, r.description,
          r.account_id, r.to_account_id, r.category_id, r.id, r.created_by
        );
        created := created + 1;
        last_d := d;
      end if;
      n := n + 1;
    end loop;
    if last_d is distinct from r.generated_until then
      update public.recurrences set generated_until = last_d where id = r.id;
    end if;
  end loop;

  return created;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões das funções
-- -----------------------------------------------------------------------------
revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.create_invite(uuid) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.generate_recurrences(uuid, integer) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.generate_recurrences(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.recurrences enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_log enable row level security;

-- Perfis: o próprio e os de quem divide algum grupo comigo.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.group_members me
      join public.group_members other on other.group_id = me.group_id
      where me.user_id = auth.uid() and other.user_id = profiles.id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Grupos: criados só por create_group; dono edita e exclui.
create policy groups_select on public.groups for select to authenticated
  using (public.is_member(id));
create policy groups_update on public.groups for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));
create policy groups_delete on public.groups for delete to authenticated
  using (public.is_owner(id));

-- Membros: entram só por create_group/accept_invite; dono muda papel e remove; membro pode sair.
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_member(group_id));
create policy group_members_update on public.group_members for update to authenticated
  using (public.is_owner(group_id)) with check (public.is_owner(group_id));
create policy group_members_delete on public.group_members for delete to authenticated
  using (public.is_owner(group_id) or user_id = auth.uid());

-- Convites: criados só por create_invite; dono vê e revoga.
create policy group_invites_select on public.group_invites for select to authenticated
  using (public.is_owner(group_id));
create policy group_invites_delete on public.group_invites for delete to authenticated
  using (public.is_owner(group_id));

-- Dados financeiros: qualquer membro do grupo lê e escreve.
create policy accounts_all on public.accounts for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy categories_all on public.categories for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy recurrences_all on public.recurrences for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy transactions_all on public.transactions for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));

-- Histórico: só leitura; escrito pelos gatilhos.
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_member(group_id));
