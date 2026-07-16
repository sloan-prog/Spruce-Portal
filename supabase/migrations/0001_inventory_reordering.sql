-- Migration 0001: Par-based reorder evaluation.
-- ADDITIVE ONLY. Honors the set-once contract: reads current_on_hand, never writes it.
-- Reorder need = current_on_hand <= min_threshold; suggested_qty = order-to-par (target_par - current_on_hand).

create or replace view public.v_reorder_needed as
select
  ps.property_id,
  p.property_name,
  p.plan_type::text as plan_type,
  ps.item_code,
  ic.item_name,
  ps.current_on_hand,
  ps.min_threshold,
  ps.target_par,
  greatest(ps.target_par - ps.current_on_hand, 0) as suggested_qty
from public.property_stock ps
left join public.properties  p  on p.property_id = ps.property_id
left join public.item_catalog ic on ic.item_code  = ps.item_code
where ps.target_par > 0
  and ps.current_on_hand <= ps.min_threshold;

create or replace view public.v_warehouse_reorder as
select
  ws.item_code,
  ws.item_name,
  ws.units_on_hand,
  ws.reorder_point,
  ws.current_season_par,
  greatest(ws.current_season_par - ws.units_on_hand, 0) as suggested_qty
from public.warehouse_stock ws
where ws.units_on_hand <= ws.reorder_point;

create or replace function public.evaluate_reorders(p_property_id text default null)
returns integer
language plpgsql
as $fn$
declare
  v_count integer := 0;
begin
  with ins as (
    insert into public.low_stock_alerts
      (alert_id, alert_date, property_id, property_name, plan_type,
       item_code, item_name, on_hand, threshold, suggested_qty, resolved)
    select
      'LSA-' || substr(replace(gen_random_uuid()::text,'-',''),1,12),
      current_date,
      v.property_id, v.property_name, v.plan_type,
      v.item_code, v.item_name, v.current_on_hand, v.min_threshold, v.suggested_qty, false
    from public.v_reorder_needed v
    where (p_property_id is null or v.property_id = p_property_id)
      and not exists (
        select 1 from public.low_stock_alerts a
        where a.property_id = v.property_id
          and a.item_code   = v.item_code
          and a.resolved    = false
      )
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$fn$;

-- ===== ROLLBACK (manual) =====
-- drop function if exists public.evaluate_reorders(text);
-- drop view if exists public.v_warehouse_reorder;
-- drop view if exists public.v_reorder_needed;
