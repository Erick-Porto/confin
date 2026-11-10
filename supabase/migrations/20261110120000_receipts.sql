-- Confin: Fase 6 (comprovantes)
--
-- Arquivos no bucket privado "receipts", no caminho <group_id>/<transaction_id>/<arquivo>.
-- transaction_attachments liga cada arquivo ao lançamento. O acesso aos arquivos segue o grupo
-- da primeira pasta do caminho. O banco não apaga arquivos do armazenamento: quem exclui um
-- lançamento ou grupo remove os arquivos pelo app (src/features/attachments/attachments.ts).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table public.transaction_attachments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  file_name text not null check (char_length(file_name) between 1 and 120),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index transaction_attachments_tx_idx on public.transaction_attachments (transaction_id);
create index transaction_attachments_group_idx on public.transaction_attachments (group_id);

-- O anexo fica no grupo do lançamento, e o arquivo, na pasta desse lançamento.
create or replace function public.check_attachment() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.transactions where id = new.transaction_id and group_id = new.group_id) then
    raise exception 'Lançamento não pertence ao grupo';
  end if;
  if left(new.storage_path, 74) <> new.group_id::text || '/' || new.transaction_id::text || '/'
     or char_length(new.storage_path) <= 74 then
    raise exception 'Caminho do comprovante inválido';
  end if;
  return new;
end;
$$;

create trigger transaction_attachments_10_actor before insert or update on public.transaction_attachments
  for each row execute function public.set_actor();
create trigger transaction_attachments_20_check before insert or update on public.transaction_attachments
  for each row execute function public.check_attachment();
create trigger transaction_attachments_90_audit after insert or update or delete on public.transaction_attachments
  for each row execute function public.audit_row();

alter table public.transaction_attachments enable row level security;
create policy transaction_attachments_all on public.transaction_attachments for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));

-- Arquivo do bucket: pertence ao grupo da primeira pasta do caminho. Caminho fora do padrão = sem acesso.
create or replace function public.can_access_receipt(object_name text) returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  return public.is_member(split_part(object_name, '/', 1)::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

revoke execute on function public.can_access_receipt(text) from public, anon;
grant execute on function public.can_access_receipt(text) to authenticated;

-- Ver, enviar e apagar arquivos do próprio grupo. Sem update: o app nunca sobrescreve um arquivo.
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.can_access_receipt(name));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_access_receipt(name));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.can_access_receipt(name));
