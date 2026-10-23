-- EAC Store: catálogo incremental, sem alterações nas tabelas de camisas.
-- Executar apenas no projeto Supabase EAC após revisão e backup.
create table if not exists public.eac_store_products (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 2 and 120),
 description text,
 price numeric(12,2) not null check (price>=0),
 image_path text,
 image_url text,
 active boolean not null default false,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists eac_store_products_public_idx on public.eac_store_products(active,sort_order);
alter table public.eac_store_products enable row level security;
revoke all on public.eac_store_products from anon,authenticated;
grant select (id,name,description,price,image_url,active,sort_order) on public.eac_store_products to anon,authenticated;
drop policy if exists eac_store_public_products on public.eac_store_products;
create policy eac_store_public_products on public.eac_store_products for select to anon,authenticated using (active=true);
-- Escrita exclusiva pelo backend EAC com service role e checagem explícita de ADMIN.
-- O bucket é isolado dos comprovantes PIX, que permanecem privados.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('eac-store-products','eac-store-products',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Nenhuma policy de upload para anon ou authenticated; upload exclusivamente server-side por service role.
