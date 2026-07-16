-- Migration 0002: Normalize raw_laundry intake into laundry_jobs. Idempotent.

create unique index if not exists uq_laundry_jobs_job_id on public.laundry_jobs (laundry_job_id);

create or replace function public.process_raw_laundry()
returns integer
language plpgsql
as $fn$
declare
  v_count integer := 0;
begin
  insert into public.laundry_jobs
    (laundry_job_id, property_id, property_name, clean_event_id,
     requested_pickup_date, pickup_status, bag_count, vendor, notes)
  select
    'LJ-' || s.submission_id,
    s.property_id, s.property_name, nullif(s.clean_id,''),
    coalesce(s.submission_date::date, current_date),
    'PENDING'::laundry_status_enum,
    s.bag_count, 'POPLIN', s.notes
  from public.raw_laundry s
  where coalesce(s.processed,false) = false
  on conflict (laundry_job_id) do nothing;

  update public.raw_laundry r set processed = true
  where coalesce(r.processed,false) = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- ===== ROLLBACK (manual) =====
-- drop function if exists public.process_raw_laundry();
-- drop index if exists public.uq_laundry_jobs_job_id;
