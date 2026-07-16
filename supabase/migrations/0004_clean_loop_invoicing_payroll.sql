-- Migration 0004: Close the clean loop. raw_completed_clean -> cleans_normalized,
-- and in the SAME transaction generate invoicing_queue (per property/week) and
-- payroll_queue (per cleaner/week). No triggers. Pricing via calculate_clean_cost only.
-- Sun-Sat weeks, anchored in spruce_config. Staging rows only (no charge/pay).

-- ---- Cadence config (anchor + offsets). Insert-if-absent so prod values are untouched. ----
insert into public.spruce_config (config_key, config_value) values
  ('cadence_week_anchor', '2026-07-05'),   -- a known Sunday
  ('invoice_offset_days', '2'),            -- week_end (Sat) + 2 = Monday
  ('pay_period_weeks',    '2'),            -- biweekly
  ('pay_offset_days',     '6')             -- pay_period_end (Sat) + 6 = Friday
on conflict (config_key) do nothing;

-- ---- Schema additions to queues ----
alter table public.invoicing_queue add column if not exists invoice_date date;
alter table public.payroll_queue  add column if not exists pay_period_start date;
alter table public.payroll_queue  add column if not exists pay_period_end   date;
alter table public.payroll_queue  add column if not exists pay_date         date;

create unique index if not exists uq_cleans_normalized_event on public.cleans_normalized (clean_event_id);
create unique index if not exists uq_invoicing_property_week on public.invoicing_queue (property_id, week_start);
create unique index if not exists uq_payroll_cleaner_week    on public.payroll_queue (cleaner_id, week_start);

-- ---- Cadence helpers (read config, derive everything from anchor) ----
create or replace function public.cadence_anchor() returns date language sql stable as $$
  select coalesce((select config_value::date from public.spruce_config where config_key='cadence_week_anchor'), date '2026-07-05');
$$;
create or replace function public.cadence_cfg_int(p_key text, p_default int) returns int language sql stable as $$
  select coalesce((select config_value::int from public.spruce_config where config_key=p_key), p_default);
$$;
create or replace function public.cadence_week_start(d date) returns date language sql stable as $$
  select public.cadence_anchor() + (floor((d - public.cadence_anchor())::numeric / 7)::int * 7);
$$;
create or replace function public.cadence_week_end(d date) returns date language sql stable as $$
  select public.cadence_week_start(d) + 6;
$$;
create or replace function public.cadence_invoice_date(d date) returns date language sql stable as $$
  select public.cadence_week_end(d) + public.cadence_cfg_int('invoice_offset_days', 2);
$$;
create or replace function public.cadence_pay_period_start(d date) returns date language sql stable as $$
  select public.cadence_anchor() + (floor((d - public.cadence_anchor())::numeric / (7 * public.cadence_cfg_int('pay_period_weeks',2)))::int * (7 * public.cadence_cfg_int('pay_period_weeks',2)));
$$;
create or replace function public.cadence_pay_period_end(d date) returns date language sql stable as $$
  select public.cadence_pay_period_start(d) + (7 * public.cadence_cfg_int('pay_period_weeks',2)) - 1;
$$;
create or replace function public.cadence_pay_date(d date) returns date language sql stable as $$
  select public.cadence_pay_period_end(d) + public.cadence_cfg_int('pay_offset_days', 6);
$$;

-- ---- Biweekly payroll grouping as a SEPARATE layer (weekly rows stay intact) ----
create or replace view public.v_payroll_biweekly as
select
  cleaner_id,
  max(cleaner_name)         as cleaner_name,
  pay_period_start,
  pay_period_end,
  pay_date,
  count(*)                  as weeks_in_period,
  sum(clean_count)          as clean_count,
  sum(total)                as period_total
from public.payroll_queue
group by cleaner_id, pay_period_start, pay_period_end, pay_date;

-- ---- The clean-loop processor ----
create or replace function public.process_completed_clean(p_submission_id text default null)
returns jsonb
language plpgsql
as $fn$
declare
  r          record;
  v_prop     record;
  v_owner    record;
  v_cleaner  record;
  v_cost     jsonb;
  v_plan     text;
  v_fee      numeric;
  v_labor    numeric;
  v_rate     numeric;
  v_event    text;
  v_cdate    date;
  v_ws date; v_we date; v_inv date;
  v_pps date; v_ppe date; v_pd date;
  v_processed int := 0;
  v_details jsonb := '[]'::jsonb;
begin
  for r in
    select * from public.raw_completed_clean
    where coalesce(processed,false)=false
      and (p_submission_id is null or submission_id = p_submission_id)
  loop
    select * into v_prop from public.properties where property_id = r.property_id;
    v_event := coalesce(nullif(r.clean_id,''), r.submission_id);
    v_cdate := coalesce(r.submission_date::date, current_date);
    v_plan  := upper(coalesce(nullif(r.plan_type,''), v_prop.plan_type::text, 'SIMPLY'));
    select * into v_owner   from public.owners   where owner_id = v_prop.owner_id;
    select * into v_cleaner from public.cleaners
      where lower(first_name)=lower(coalesce(r.cleaner_first,''))
        and lower(last_name) =lower(coalesce(r.cleaner_last,''))
      limit 1;

    insert into public.cleans_normalized
      (clean_event_id, clean_id, property_id, property_name, owner_id, clean_date, plan_type,
       cleaner_id, cleaner_name, status, complete_clean_submission_id, processed)
    values
      (v_event, nullif(r.clean_id,''), r.property_id, coalesce(r.property_name, v_prop.property_name),
       v_prop.owner_id, v_cdate, v_plan,
       v_cleaner.cleaner_id, nullif(trim(coalesce(r.cleaner_first,'')||' '||coalesce(r.cleaner_last,'')),''),
       'COMPLETED'::clean_status_enum, r.submission_id, true)
    on conflict (clean_event_id) do update
      set status='COMPLETED'::clean_status_enum, processed=true, updated_at=now();

    -- pricing (authoritative; never recomputed here)
    v_cost := public.calculate_clean_cost(r.property_id);
    if (v_cost ? 'error') then
      update public.raw_completed_clean set processed=true where submission_id=r.submission_id;
      v_processed := v_processed + 1;
      v_details := v_details || jsonb_build_object('submission_id', r.submission_id, 'pricing_error', v_cost->>'error');
      continue;
    end if;

    v_fee   := case when v_plan='SIGNATURE' then (v_cost->>'signature_price')::numeric
                    else (v_cost->>'simply_price')::numeric end;
    v_labor := (v_cost->>'labor_cost')::numeric;
    select config_value::numeric into v_rate from public.spruce_config where config_key='pay_rate_per_hr';

    v_ws := public.cadence_week_start(v_cdate);
    v_we := public.cadence_week_end(v_cdate);
    v_inv := public.cadence_invoice_date(v_cdate);
    v_pps := public.cadence_pay_period_start(v_cdate);
    v_ppe := public.cadence_pay_period_end(v_cdate);
    v_pd  := public.cadence_pay_date(v_cdate);

    -- INVOICING: one row per (property_id, week_start); ACCUMULATE (add, never overwrite)
    insert into public.invoicing_queue
      (invoice_id, property_id, property_name, plan_type, owner_id, owner_name, owner_email,
       week_start, week_end, invoice_date, clean_count, cleaning_fee, cleaning_total,
       clean_dates, subtotal, total, status, processed)
    values
      ('INV-'||r.property_id||'-'||to_char(v_ws,'YYYYMMDD'),
       r.property_id, coalesce(r.property_name, v_prop.property_name), v_plan,
       v_prop.owner_id, v_owner.owner_name, coalesce(v_owner.billing_email, v_owner.owner_email),
       v_ws, v_we, v_inv, 1, v_fee, v_fee,
       to_char(v_cdate,'YYYY-MM-DD'), v_fee, v_fee, 'READY'::invoice_status_enum, false)
    on conflict (property_id, week_start) do update
      set clean_count    = public.invoicing_queue.clean_count + 1,
          cleaning_total = public.invoicing_queue.cleaning_total + excluded.cleaning_fee,
          subtotal       = coalesce(public.invoicing_queue.subtotal,0) + excluded.cleaning_fee,
          total          = coalesce(public.invoicing_queue.total,0) + excluded.cleaning_fee,
          clean_dates    = public.invoicing_queue.clean_dates || ', ' || excluded.clean_dates,
          cleaning_fee   = excluded.cleaning_fee,
          week_end       = excluded.week_end,
          invoice_date   = excluded.invoice_date,
          updated_at     = now();

    -- PAYROLL: weekly accrual per (cleaner_id, week_start); ACCUMULATE
    if v_cleaner.cleaner_id is not null then
      insert into public.payroll_queue
        (payroll_id, cleaner_id, cleaner_name, week_start, week_end,
         pay_period_start, pay_period_end, pay_date, clean_count, pay_rate, total, status)
      values
        ('PAY-'||v_cleaner.cleaner_id||'-'||to_char(v_ws,'YYYYMMDD'),
         v_cleaner.cleaner_id, nullif(trim(coalesce(v_cleaner.first_name,'')||' '||coalesce(v_cleaner.last_name,'')),''),
         v_ws, v_we, v_pps, v_ppe, v_pd, 1, v_rate, v_labor, 'PENDING')
      on conflict (cleaner_id, week_start) do update
        set clean_count      = public.payroll_queue.clean_count + 1,
            total            = public.payroll_queue.total + excluded.total,
            pay_period_start = excluded.pay_period_start,
            pay_period_end   = excluded.pay_period_end,
            pay_date         = excluded.pay_date,
            week_end         = excluded.week_end;
    end if;

    update public.raw_completed_clean set processed=true where submission_id=r.submission_id;
    v_processed := v_processed + 1;
    v_details := v_details || jsonb_build_object(
      'submission_id', r.submission_id, 'clean_event_id', v_event, 'property_id', r.property_id,
      'plan', v_plan, 'clean_date', v_cdate,
      'week_start', v_ws, 'week_end', v_we, 'invoice_date', v_inv,
      'pay_period_start', v_pps, 'pay_period_end', v_ppe, 'pay_date', v_pd,
      'cleaning_fee', v_fee, 'labor', v_labor, 'pay_rate', v_rate,
      'cleaner_id', v_cleaner.cleaner_id);
  end loop;

  return jsonb_build_object('processed', v_processed, 'details', v_details);
end;
$fn$;

-- ===== ROLLBACK (manual) =====
-- drop function if exists public.process_completed_clean(text);
-- drop view if exists public.v_payroll_biweekly;
-- drop function if exists public.cadence_pay_date(date), public.cadence_pay_period_end(date), public.cadence_pay_period_start(date),
--   public.cadence_invoice_date(date), public.cadence_week_end(date), public.cadence_week_start(date),
--   public.cadence_cfg_int(text,int), public.cadence_anchor();
-- drop index if exists public.uq_payroll_cleaner_week, public.uq_invoicing_property_week, public.uq_cleans_normalized_event;
-- alter table public.payroll_queue drop column if exists pay_date, drop column if exists pay_period_end, drop column if exists pay_period_start;
-- alter table public.invoicing_queue drop column if exists invoice_date;
-- delete from public.spruce_config where config_key in ('cadence_week_anchor','invoice_offset_days','pay_period_weeks','pay_offset_days');
