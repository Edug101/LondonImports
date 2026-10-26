-- London Imports | Cupons e relatório. Rode DEPOIS do schema.sql.
-- Pode rodar mais de uma vez sem erro. Não mexe nos produtos nem na loja.

-- Cupons: desconto em % (10 a 70, de 5 em 5) ou "compre 2 ganhe 1"
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null default 'percent',
  percent int,
  product_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table public.coupons drop constraint if exists coupons_ck;
alter table public.coupons add constraint coupons_ck check (
  code ~ '^[A-Z0-9_-]{2,30}$'
  and kind in ('percent','b2g1')
  and (kind = 'b2g1' or (percent between 10 and 70 and percent % 5 = 0))
  and coalesce(array_length(product_ids,1),0) <= 500);

-- Cada pedido enviado com cupom (WhatsApp ou Pix) vira uma linha aqui
create table if not exists public.coupon_uses (
  id bigint generated always as identity primary key,
  coupon_id uuid references public.coupons(id) on delete set null,
  code text not null,
  discount numeric(10,2) not null,
  total numeric(10,2) not null,
  channel text,
  created_at timestamptz default now()
);

alter table public.coupons enable row level security;
alter table public.coupon_uses enable row level security;
revoke all on public.coupons, public.coupon_uses from anon;
grant select on public.coupons to anon;

drop policy if exists "publico ve promocoes" on public.coupons;
drop policy if exists "admin gerencia cupons" on public.coupons;
drop policy if exists "admin ve usos" on public.coupon_uses;
drop policy if exists "admin apaga usos" on public.coupon_uses;
-- visitante só enxerga as promoções "compre 2 ganhe 1" ativas (para mostrar o selo no produto);
-- os cupons de % ficam escondidos e só são conferidos pelo código
create policy "publico ve promocoes" on public.coupons for select to anon, authenticated using (active and kind = 'b2g1');
create policy "admin gerencia cupons" on public.coupons for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin ve usos" on public.coupon_uses for select to authenticated using ((select public.is_admin()));
create policy "admin apaga usos" on public.coupon_uses for delete to authenticated using ((select public.is_admin()));

-- Confere um cupom digitado pelo cliente
create or replace function public.check_coupon(p_code text)
returns table (code text, kind text, percent int, product_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select c.code, c.kind, c.percent, c.product_ids from public.coupons c
  where c.active and c.code = upper(trim(p_code)) limit 1
$$;

-- Registra quanto o cupom economizou num pedido
create or replace function public.log_coupon_use(p_code text, p_discount numeric, p_total numeric, p_channel text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.coupons;
begin
  select * into c from public.coupons where code = upper(trim(p_code)) and active;
  if c.id is null then return; end if;
  if p_discount is null or p_total is null or p_discount <= 0 or p_total < 0
     or p_discount > 1000000 or p_total > 1000000 then return; end if;
  insert into public.coupon_uses (coupon_id, code, discount, total, channel)
  values (c.id, c.code, round(p_discount, 2), round(p_total, 2),
          case when p_channel in ('whatsapp','pix') then p_channel else null end);
end $$;

revoke all on function public.check_coupon(text) from public;
revoke all on function public.log_coupon_use(text, numeric, numeric, text) from public;
grant execute on function public.check_coupon(text) to anon, authenticated;
grant execute on function public.log_coupon_use(text, numeric, numeric, text) to anon, authenticated;
