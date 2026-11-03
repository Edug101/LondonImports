-- London Imports | Frete pelo CEP e cupom de frete grátis. Rode DEPOIS do cupons.sql.
-- Pode rodar mais de uma vez sem erro. Não mexe nos produtos.

-- Tabela de frete da loja (editada no painel)
alter table public.settings add column if not exists ship_cep text;
alter table public.settings add column if not exists ship_rates jsonb;
alter table public.settings drop constraint if exists settings_ship_ck;
alter table public.settings add constraint settings_ship_ck check (
  (ship_cep is null or ship_cep ~ '^[0-9]{8}$')
  and (ship_rates is null or (jsonb_typeof(ship_rates) = 'object' and pg_column_size(ship_rates) < 4000))) not valid;

-- Cupom novo: frete grátis para compras acima de um valor
alter table public.coupons add column if not exists min_total numeric(10,2);
alter table public.coupons drop constraint if exists coupons_ck;
alter table public.coupons add constraint coupons_ck check (
  code ~ '^[A-Z0-9_-]{2,30}$'
  and kind in ('percent','b2g1','freeship')
  and (kind <> 'percent' or (percent between 10 and 70 and percent % 5 = 0))
  and (kind <> 'freeship' or (min_total between 0 and 1000000))
  and coalesce(array_length(product_ids,1),0) <= 500);

-- visitante enxerga as promoções automáticas ativas (compre 2 ganhe 1 e frete grátis)
drop policy if exists "publico ve promocoes" on public.coupons;
create policy "publico ve promocoes" on public.coupons for select to anon, authenticated using (active and kind in ('b2g1','freeship'));
