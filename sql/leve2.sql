-- London Imports | Promoção "compre 1 e leve outro por 50%". Rode DEPOIS do cupons.sql.
-- Pode rodar mais de uma vez sem erro. Não mexe nos produtos.

alter table public.coupons add column if not exists min_total numeric(10,2);
alter table public.coupons drop constraint if exists coupons_ck;
alter table public.coupons add constraint coupons_ck check (
  code ~ '^[A-Z0-9_-]{2,30}$'
  and kind in ('percent','b2g1','b1g50','freeship')
  and (kind <> 'percent' or (percent between 10 and 70 and percent % 5 = 0))
  and (kind <> 'freeship' or (min_total between 0 and 1000000))
  and coalesce(array_length(product_ids,1),0) <= 500);

-- visitante enxerga as promoções automáticas ativas (para mostrar o selo no produto)
drop policy if exists "publico ve promocoes" on public.coupons;
create policy "publico ve promocoes" on public.coupons for select to anon, authenticated using (active and kind in ('b2g1','b1g50','freeship'));
