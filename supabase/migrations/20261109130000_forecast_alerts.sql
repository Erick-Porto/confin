-- Confin: Fase 5 (previsão e avisos)
--
-- - Tags livres nos lançamentos.
-- - Inscrições de notificação (Web Push) e preferências de aviso por pessoa.
-- - Registro dos avisos já enviados pelo job diário (.github/workflows/notify.yml).
-- - Excluir grupo e excluir a própria conta, na ordem que as chaves estrangeiras exigem.

-- -----------------------------------------------------------------------------
-- Tags
-- -----------------------------------------------------------------------------

alter table public.transactions
  add column tags text[] not null default '{}';
create index transactions_tags_idx on public.transactions using gin (tags);

-- Tags em minúsculas, sem espaços nas pontas, sem vazias nem repetidas, até 30 caracteres; no máximo 10.
create or replace function public.normalize_tags() returns trigger
language plpgsql
as $$
begin
  new.tags := coalesce((
    select array_agg(t order by pos)
    from (
      select distinct on (t) t, pos
      from (
        select lower(left(btrim(x), 30)) as t, ord as pos
        from unnest(new.tags) with ordinality as u(x, ord)
      ) s
      where t <> ''
      order by t, pos
    ) d
  ), '{}');
  if cardinality(new.tags) > 10 then
    raise exception 'Use no máximo 10 tags por lançamento';
  end if;
  return new;
end;
$$;

create trigger transactions_05_tags before insert or update of tags on public.transactions
  for each row execute function public.normalize_tags();

-- Tags usadas no grupo, das mais usadas para as menos.
create or replace function public.group_tags(p_group uuid)
returns table (tag text, uses bigint)
language sql stable security invoker set search_path = public
as $$
  select t, count(*)
  from public.transactions tx, unnest(tx.tags) as t
  where tx.group_id = p_group
  group by t
  order by count(*) desc, t
  limit 200;
$$;

-- -----------------------------------------------------------------------------
-- Notificações
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column notify_bills boolean not null default true,
  add column notify_budget boolean not null default true;

-- Um registro por aparelho/navegador inscrito.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Avisos já enviados, para o job não repetir. Só o job (dono do banco) lê e escreve.
create table public.notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Inscreve este aparelho para a pessoa logada. Se o aparelho era de outra pessoa, passa a ser desta.
-- Só aceita os serviços de push dos navegadores, para o job nunca chamar endereços arbitrários.
create or replace function public.register_push(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida';
  end if;
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then
    raise exception 'Serviço de notificação não suportado neste navegador';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300));
end;
$$;

-- -----------------------------------------------------------------------------
-- Excluir grupo e conta
-- -----------------------------------------------------------------------------

-- Durante a exclusão de um usuário, o banco troca created_by/updated_by por null.
-- set_actor não pode desfazer isso, senão sobram referências ao usuário excluído.
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
    if current_setting('confin.deleting_user', true) = 'on' then
      return new;
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Apaga o grupo e tudo dele. Lançamentos e aplicações primeiro, porque prendem as contas.
create or replace function public.purge_group(g uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.transactions where group_id = g;
  delete from public.recurrences where group_id = g;
  delete from public.investments where group_id = g;
  delete from public.groups where id = g;
end;
$$;

create or replace function public.delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_owner(p_group) then
    raise exception 'Apenas o dono pode excluir o grupo';
  end if;
  perform public.purge_group(p_group);
end;
$$;

-- Exclui a conta de quem chama:
-- - grupos onde a pessoa está sozinha são apagados;
-- - nos outros, ela sai (as contas dela viram conjuntas) e, se era a única dona, o membro mais antigo vira dono;
-- - por fim o usuário é apagado (perfil, inscrições e avisos vão junto).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  m record;
  heir uuid;
begin
  if me is null then
    raise exception 'Sessão inválida';
  end if;
  for m in select group_id, role from public.group_members where user_id = me loop
    if not exists (select 1 from public.group_members where group_id = m.group_id and user_id <> me) then
      perform public.purge_group(m.group_id);
    else
      if m.role = 'owner' and not exists (
        select 1 from public.group_members where group_id = m.group_id and user_id <> me and role = 'owner'
      ) then
        select user_id into heir from public.group_members
        where group_id = m.group_id and user_id <> me
        order by joined_at
        limit 1;
        update public.group_members set role = 'owner' where group_id = m.group_id and user_id = heir;
      end if;
      delete from public.group_members where group_id = m.group_id and user_id = me;
    end if;
  end loop;
  perform set_config('confin.deleting_user', 'on', true);
  delete from auth.users where id = me;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões e RLS
-- -----------------------------------------------------------------------------

revoke execute on function public.purge_group(uuid) from public, anon, authenticated;
revoke execute on function public.group_tags(uuid) from public, anon;
revoke execute on function public.register_push(text, text, text, text) from public, anon;
revoke execute on function public.delete_group(uuid) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.group_tags(uuid) to authenticated;
grant execute on function public.register_push(text, text, text, text) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

-- Cada pessoa vê e remove só as próprias inscrições (inscrever é pela RPC register_push).
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
