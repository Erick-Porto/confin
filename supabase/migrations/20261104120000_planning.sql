-- Confin: Fase 3 (planejamento financeiro por blocos, ex.: 50/30/20)
--
-- Cada grupo tem um plano: blocos com um percentual da renda (somando 100%).
-- Cada categoria de saída de primeiro nível aponta para um bloco; as subcategorias seguem a categoria pai.
-- Blocos de investimento também contam os aportes (transferências para contas de investimento), calculados no app.

create type public.plan_block_kind as enum ('spend', 'invest');

create table public.plan_blocks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind public.plan_block_kind not null default 'spend',
  percent smallint not null check (percent between 0 and 100),
  color text not null default '#64748B',
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index plan_blocks_group_idx on public.plan_blocks (group_id);

alter table public.categories
  add column plan_block_id uuid references public.plan_blocks (id) on delete set null;

-- Só categorias de saída de primeiro nível têm bloco, e sempre um bloco do mesmo grupo.
create or replace function public.check_category_block() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.plan_block_id is null then
    return new;
  end if;
  -- Subcategorias e entradas ficam sem bloco: contam pelo bloco da categoria pai.
  if new.parent_id is not null or new.kind <> 'expense' then
    new.plan_block_id := null;
    return new;
  end if;
  if not exists (select 1 from public.plan_blocks where id = new.plan_block_id and group_id = new.group_id) then
    raise exception 'Bloco do plano inválido';
  end if;
  return new;
end;
$$;

create trigger categories_30_block before insert or update on public.categories
  for each row execute function public.check_category_block();

create trigger plan_blocks_10_actor before insert or update on public.plan_blocks
  for each row execute function public.set_actor();
create trigger plan_blocks_90_audit after insert or update or delete on public.plan_blocks
  for each row execute function public.audit_row();

-- Salva o plano inteiro de uma vez: blocos (somando 100%) e o bloco de cada categoria.
-- p_blocks: [{id, name, kind, percent, color}] na ordem de exibição (ids gerados pelo app).
-- p_categories: [{category_id, block_id|null}]. Lista de blocos vazia remove o plano.
-- Roda com as permissões de quem chama, então o RLS continua valendo.
create or replace function public.save_plan(p_group uuid, p_blocks jsonb, p_categories jsonb default '[]'::jsonb)
returns void
language plpgsql security invoker set search_path = public
as $$
declare
  total integer;
  ids uuid[];
begin
  if not public.is_member(p_group) then
    raise exception 'Você não participa deste grupo';
  end if;
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_typeof(p_categories) <> 'array' then
    raise exception 'Plano inválido';
  end if;
  if jsonb_array_length(p_blocks) > 8 then
    raise exception 'O plano aceita no máximo 8 blocos';
  end if;

  select coalesce(sum((b ->> 'percent')::integer), 0), coalesce(array_agg((b ->> 'id')::uuid), '{}')
    into total, ids
    from jsonb_array_elements(p_blocks) as b;
  if jsonb_array_length(p_blocks) > 0 and total <> 100 then
    raise exception '%', format('A soma dos blocos está em %s%%; ela precisa ser 100%%', total);
  end if;

  delete from public.plan_blocks where group_id = p_group and id <> all (ids);

  insert into public.plan_blocks (id, group_id, name, kind, percent, color, sort_order)
  select (b ->> 'id')::uuid, p_group, trim(b ->> 'name'), (b ->> 'kind')::public.plan_block_kind,
         (b ->> 'percent')::smallint, coalesce(b ->> 'color', '#64748B'), (ord::integer - 1) * 10
    from jsonb_array_elements(p_blocks) with ordinality as t(b, ord)
  on conflict (id) do update
    set name = excluded.name, kind = excluded.kind, percent = excluded.percent,
        color = excluded.color, sort_order = excluded.sort_order
    where plan_blocks.group_id = p_group;

  update public.categories c
     set plan_block_id = (m ->> 'block_id')::uuid
    from jsonb_array_elements(p_categories) as m
   where c.id = (m ->> 'category_id')::uuid
     and c.group_id = p_group
     and c.plan_block_id is distinct from (m ->> 'block_id')::uuid;
end;
$$;

revoke execute on function public.save_plan(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_plan(uuid, jsonb, jsonb) to authenticated;

alter table public.plan_blocks enable row level security;
create policy plan_blocks_all on public.plan_blocks for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
