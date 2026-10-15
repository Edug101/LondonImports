-- London Imports | Schema seguro. Pode rodar mais de uma vez sem erro.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null, brand text, category text, description text,
  price numeric(10,2) not null default 0, old_price numeric(10,2),
  sizes text[] default '{}', image_url text,
  featured boolean default false, popular boolean default false, active boolean default true,
  created_at timestamptz default now()
);
alter table public.products add column if not exists popular boolean default false;
alter table public.products add column if not exists whatsapp text;
alter table public.products add column if not exists images text[] default '{}';
alter table public.products add column if not exists pix_key text;
alter table public.products add column if not exists sold boolean default false;
update public.products set images = array[image_url] where image_url is not null and coalesce(array_length(images,1),0) = 0;
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  store_name text default 'London Imports',
  whatsapp text default '5511999999999',
  instagram text default ''
);
insert into public.settings (id) values (1) on conflict do nothing;
alter table public.settings add column if not exists pix_key text;
alter table public.settings add column if not exists pix_name text default 'LONDON IMPORTS';
alter table public.settings add column if not exists pix_city text default 'SAO PAULO';
update public.settings set pix_key = 'ce079db1-ab26-4605-a97c-49c092e0caf7' where id = 1 and pix_key is null;
create table if not exists public.admins (email text primary key);

alter table public.products enable row level security;
alter table public.settings enable row level security;
alter table public.admins enable row level security; -- sem policies: ninguém lê pela API

-- Quem é admin? (só e-mails cadastrados na tabela admins)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email','')))
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Permissões mínimas para visitantes (anon): só leitura
revoke all on public.products, public.settings from anon;
grant select on public.products, public.settings to anon;
revoke all on public.admins from anon, authenticated;

create or replace function public.all_https(a text[]) returns boolean
language sql immutable set search_path = '' as $$ select coalesce(bool_and(i ~ '^https://'), true) from unnest(a) i $$;

-- Regras de validação no banco
alter table public.products drop constraint if exists products_ck;
alter table public.products add constraint products_ck check (
  char_length(name) between 1 and 120 and char_length(coalesce(brand,'')) <= 60
  and char_length(coalesce(description,'')) <= 2000
  and price >= 0 and price <= 1000000 and (old_price is null or (old_price >= 0 and old_price <= 1000000))
  and coalesce(array_length(sizes,1),0) <= 30
  and (image_url is null or image_url ~ '^https://')
  and (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$')
  and (pix_key is null or pix_key ~ '^[A-Za-z0-9@.+_-]{5,77}$')
  and coalesce(array_length(images,1),0) <= 12 and public.all_https(images)
  and coalesce(category,'') in ('','Relógios','Perfumes','Tênis')) not valid;
alter table public.settings drop constraint if exists settings_ck;
alter table public.settings add constraint settings_ck check (
  whatsapp ~ '^[0-9]{10,15}$' and coalesce(instagram,'') ~ '^[A-Za-z0-9._]{0,30}$'
  and (pix_key is null or pix_key ~ '^[A-Za-z0-9@.+_-]{5,77}$')
  and coalesce(pix_name,'') ~ '^[A-Za-z0-9 ]{0,25}$' and coalesce(pix_city,'') ~ '^[A-Za-z0-9 ]{0,15}$') not valid;

-- Políticas (apaga as antigas e cria as novas)
drop policy if exists "ler produtos ativos" on public.products;
drop policy if exists "admin gerencia produtos" on public.products;
drop policy if exists "ler config" on public.settings;
drop policy if exists "admin altera config" on public.settings;
drop policy if exists "publico le ativos" on public.products;
drop policy if exists "admin le tudo" on public.products;
drop policy if exists "admin insere" on public.products;
drop policy if exists "admin edita" on public.products;
drop policy if exists "admin apaga" on public.products;
drop policy if exists "publico le config" on public.settings;
drop policy if exists "admin edita config" on public.settings;
create policy "publico le ativos" on public.products for select to anon, authenticated using (active = true);
create policy "admin le tudo" on public.products for select to authenticated using ((select public.is_admin()));
create policy "admin insere" on public.products for insert to authenticated with check ((select public.is_admin()));
create policy "admin edita" on public.products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin apaga" on public.products for delete to authenticated using ((select public.is_admin()));
create policy "publico le config" on public.settings for select to anon, authenticated using (true);
create policy "admin edita config" on public.settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Fotos: só JPG/PNG/WEBP até 5 MB, e só admin envia ou apaga
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products','products',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists "ver imagens" on storage.objects;
drop policy if exists "admin envia imagens" on storage.objects;
drop policy if exists "admin apaga imagens" on storage.objects;
create policy "ver imagens" on storage.objects for select to anon, authenticated using (bucket_id = 'products');
create policy "admin envia imagens" on storage.objects for insert to authenticated with check (bucket_id = 'products' and (select public.is_admin()));
create policy "admin apaga imagens" on storage.objects for delete to authenticated using (bucket_id = 'products' and (select public.is_admin()));

-- DEPOIS de rodar tudo acima, rode esta linha com o e-mail do admin (o mesmo do login):
-- insert into public.admins (email) values ('email-do-seu-tio@gmail.com') on conflict do nothing;
