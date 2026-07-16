# schema-buildout — Supabase migrations & intake webhooks

Branch work. **Do not merge to main without review.** Built and verified against an
isolated Supabase preview branch (`schema-buildout`, ref `vpndixxknvvxipymhlfr`) —
production project `meushwuvdmxymrvoizsl` was never touched with DDL.
Restore-point baseline noted before any change: **2026-07-16 23:03:50 UTC, txid 2434**.

## Migrations (`supabase/migrations/`)
- **0001_inventory_reordering** — `evaluate_reorders()` + `v_reorder_needed` / `v_warehouse_reorder`.
  Reorder need = `current_on_hand <= min_threshold`; suggests order-to-par. **Never writes
  `current_on_hand`** (honors the set-once contract from `api/run-par.js`). Additive.
- **0002_laundry_normalization** — `process_raw_laundry()` maps `raw_laundry` → `laundry_jobs`
  (idempotent via `LJ-<submission_id>` unique key).
- **0003_florals_vessels** — `raw_floral` intake table (perishable JIT feeds existing
  `floral_schedule/log/orders/execution`); durable vessels modeled par-style with
  `floral_vessels` (catalog) + `property_vessel_stock` (par/on-hand/threshold).
- **0004_clean_loop_invoicing_payroll** — `process_completed_clean()`: normalizes
  `raw_completed_clean` → `cleans_normalized` and, in the **same transaction**, generates
  `invoicing_queue` (per property/week) and `payroll_queue` (per cleaner/week). No triggers.
  Pricing via `calculate_clean_cost` only; payroll = labor at `pay_rate_per_hr`.
  Cadence (Sun–Sat weeks) anchored in `spruce_config`; adds `invoice_date` +
  pay-period columns + `v_payroll_biweekly`. Staging rows only — **no charge/pay**.

Each file ends with a commented manual ROLLBACK block. The DB had no prior migration
history; this establishes `supabase/migrations/` as the convention.

## Cadence (authoritative)
- Weeks run **Sunday → Saturday**; anchor `cadence_week_anchor = 2026-07-05`.
- Invoicing: one row per property per week; **invoice_date = Monday after week_end** (+2).
- Payroll: weekly accrual per cleaner; **biweekly** pay period (2 weeks);
  **pay_date = Friday after period end** (+6). Weekly rows and biweekly grouping kept as
  separate layers (`payroll_queue` rows + `v_payroll_biweekly`).

## Webhooks (`api/`)
`webhook-urgent-issue.js`, `webhook-non-urgent-issue.js`, `webhook-floral.js` — mirror the
existing `complete-clean.js` pattern (Busboy multipart, JotForm `rawRequest`,
**`SUPABASE_SERVICE_ROLE_KEY`**), inserting into `raw_urgent_issues` / `raw_non_urgent_issues`
/ `raw_floral` with `processed:false`. Field mapping is defensive; confirm exact JotForm
`qN_` IDs per form before wiring the JotForm webhook URL.

## Verification
`supabase/verification/verify_clean_pipeline.sql` — single `BEGIN … ROLLBACK`; seeds a
`TEST-VERIFY` property + 3 cleans, runs the loop, prints rows + math, rolls back. Confirmed
result: week-1 invoice $600 (2 cleans), week-2 $300; payroll two weekly rows ($208 + $104)
sharing pay_date 2026-07-24; biweekly total $312. Pricing: Signature $300/clean.

## NOT done this run (by instruction)
RLS / owner-portal isolation untouched. Stripe untouched (stays TEST mode; no charge/payout).
