-- Verification harness for the clean-loop -> invoicing/payroll pipeline.
-- Runs entirely inside ONE transaction and ROLLS BACK: no data persists.
-- Seeds a clearly-tagged synthetic property (property_id = 'TEST-VERIFY') + cleaner
-- and three completed cleans (two in week 1, one in week 2), processes them, prints
-- the resulting rows + pricing, then rolls back. Migrations stay committed; seed vanishes.
--
-- Run against the schema-buildout branch DB. See README for the confirmed output.

begin;

insert into public.spruce_config(config_key, config_value) values
  ('pay_rate_per_hr','26.00'),('laundry_rate_per_lb','1.20'),
  ('signature_markup_pct','87'),('simply_markup_pct','52')
on conflict (config_key) do nothing;

insert into public.owners(owner_id, owner_name, owner_email, billing_email)
values ('OWN-TESTVERIFY','TEST Owner','owner@test.example','billing@test.example') on conflict do nothing;

insert into public.cleaners(cleaner_id, first_name, last_name, default_pay_rate, active)
values ('CLN-TESTVERIFY','Test','Runner',26,true) on conflict do nothing;

insert into public.properties(property_id, property_name, owner_id, plan_type, bedrooms, bathrooms, sleeps, king, queen, full_beds, twin, sofa, sq_ft, active)
values ('TEST-VERIFY','TEST VERIFY PROPERTY','OWN-TESTVERIFY','SIGNATURE'::plan_type_enum, 3, 2, 6, 1, 1, 0, 0, 0, 1500, true) on conflict do nothing;

insert into public.raw_completed_clean
  (submission_id, submission_date, property_name, property_id, plan_type, clean_id, bedrooms, bathrooms, sleeps, cleaner_first, cleaner_last, processed)
values
  ('TEST-VERIFY-A','2026-07-08T15:00:00Z','TEST VERIFY PROPERTY','TEST-VERIFY','SIGNATURE','TEST-CLEAN-A',3,2,6,'Test','Runner',false),
  ('TEST-VERIFY-B','2026-07-10T15:00:00Z','TEST VERIFY PROPERTY','TEST-VERIFY','SIGNATURE','TEST-CLEAN-B',3,2,6,'Test','Runner',false),
  ('TEST-VERIFY-C','2026-07-15T15:00:00Z','TEST VERIFY PROPERTY','TEST-VERIFY','SIGNATURE','TEST-CLEAN-C',3,2,6,'Test','Runner',false);

select public.process_completed_clean(null);

select jsonb_pretty(jsonb_build_object(
  'pricing_breakdown', public.calculate_clean_cost('TEST-VERIFY'),
  'cleans_normalized', (select jsonb_agg(row_to_json(c) order by c.clean_date)
      from (select clean_event_id, property_id, plan_type, clean_date, cleaner_id, cleaner_name, status, processed
            from public.cleans_normalized where property_id='TEST-VERIFY') c),
  'invoicing_queue', (select jsonb_agg(row_to_json(i) order by i.week_start)
      from (select invoice_id, property_id, plan_type, week_start, week_end, invoice_date, clean_count, cleaning_fee, cleaning_total, total, clean_dates, status
            from public.invoicing_queue where property_id='TEST-VERIFY') i),
  'payroll_queue_weekly', (select jsonb_agg(row_to_json(p) order by p.week_start)
      from (select payroll_id, cleaner_id, week_start, week_end, pay_period_start, pay_period_end, pay_date, clean_count, pay_rate, total, status
            from public.payroll_queue where cleaner_id='CLN-TESTVERIFY') p),
  'payroll_biweekly_grouping', (select jsonb_agg(row_to_json(b))
      from (select cleaner_id, pay_period_start, pay_period_end, pay_date, weeks_in_period, clean_count, period_total
            from public.v_payroll_biweekly where cleaner_id='CLN-TESTVERIFY') b)
)) as verification;

rollback;
