# Vellum Hospitality — Standard Operating Procedures (SOP)

*Living document. Add sections as the system is built. Last updated: this session.*

---

# 1. JOTFORM STRUCTURE — Cleaner / Runner Field Forms

## How the forms work
- Each form link is **prepopulated and specific to the property** (property_id, name,
  bedrooms, bathrooms, sleeps, plan_type, coffee_type, par_cleans all carry in).
- Links are **PUBLIC — no login required for the cleaner.** The owner can simply
  **text the link to their cleaner.**
- The same links also **live in the Owner Portal**, so owners never have to fish for
  them — they can grab and send anytime.
- **The owner's cleaner uses BOTH forms** (Closet-to-Counter AND Closet Visit) so that
  when it's time to order/restock, there are **fewer errors** — the audit and the
  system-expected numbers are both captured and reconciled.

## The forms

### A. Closet to Counter  *(per-clean consumable check)*
- **Table:** `raw_closet_to_counter`
- **When:** during a turn/clean.
- **What it captures:** the calculated par per item (from property parameters),
  an "at standard?" check per zone (bathroom / kitchen / coffee), and the
  **adjusted** quantities (what was actually found / what needs topping up).
- **Property field link column:** `closet_to_counter_link` / `closet_to_counter_qr`

### B. Closet Visit  *(runner par audit + restock)*
- **Table:** `raw_closet_visit`
- **When:** runner replenishment visit (par-threshold top-up).
- **What it captures, per item:** `_audit` (physically counted on-hand),
  `_system` (what the system expects = calculated par), `_restock` (top-up needed
  → what goes in the box). Ties to `trip_stop_id` and `visit_type`.
- **Property field link column:** `closet_visit_link` / `closet_visit_qr`

### Other property field forms (links live in properties table + owner portal)
- **Begin Clean** — `begin_clean_link` / `begin_clean_qr`
- **Cleaning Task 1** — `cleaning_task_1_link` / `cleaning_task_1_qr`
- **Laundry** — `laundry_link` / `laundry_qr`
- **Non-Urgent Issue** — `non_urgent_link` / `non_urgent_qr`
- **Complete Clean** — `complete_clean_link` / `complete_clean_qr`
- (Urgent Issue form also exists)

---

# 2. ITEMS & PAR FORMULA SPECS  *(single source of truth)*

**Canonical rules live in Supabase `item_usage_rules`. This is the human-readable
reference to verify the JotForms against.**

Definitions:
- **PAR_CLEANS** = the closet par target in # of cleans (default **10**).
- **Per-clean** = amount consumed/restocked for one clean.
- **PAR (closet stock)** = per-clean × PAR_CLEANS (the full closet target).

## Consumables

| Item | item_code | Per-clean rule | PAR formula |
|---|---|---|---|
| Toilet paper | CON-001 | (Bathrooms × 2) + 2 base rolls | ((bath × 2) + 2) × PAR_CLEANS |
| Paper towels | CON-002 | 1 roll | PAR_CLEANS |
| Large trash bags | CON-003 | keep 1 onsite roll | fixed target 120 bags |
| Small trash bags | CON-004 | keep 1 onsite roll | fixed target 120 bags |
| Dish liquid | CON-005 | 1 set-out | PAR_CLEANS |
| Laundry detergent packs | CON-006 | **3 packs** | PAR_CLEANS × 3 |
| Dishwasher pods | CON-007 | 3 pods | PAR_CLEANS × 3 |
| Shampoo | CON-008 | 2 per bathroom | bath × 2 × PAR_CLEANS |
| Conditioner | CON-009 | 2 per bathroom | bath × 2 × PAR_CLEANS |
| Body wash / soap | CON-010 | 2 per bathroom | bath × 2 × PAR_CLEANS |
| Makeup wipes | CON-011 | 6 per bathroom | bath × 6 × PAR_CLEANS |
| Jet Dry / rinse aid | CON-012 | ~1 per 10 cleans | CEILING(PAR_CLEANS × 0.10) |

## Coffee station
Coffee servings per clean = **CEILING(SLEEPS × 2.5)**. Coffee **item** depends on
the property's `coffee_type`:

| coffee_type | Coffee pods (CON-016) | Coffee bags (CON-017) |
|---|---|---|
| **PODS** (pod-only) | CEILING(SLEEPS × 2.5) /clean → × PAR_CLEANS | 0 |
| **GROUND** (ground-only) | 0 | 1 bag/clean → PAR_CLEANS bags |
| **BOTH** (hybrid) | CEILING(SLEEPS × 1.25) /clean → × PAR_CLEANS | ~0.5 bag/clean → CEILING(PAR_CLEANS × 0.5) |

**Coffee condiments** (all = 1 per supported coffee serving, i.e. CEILING(SLEEPS × 2.5)/clean):
- Sugar packets (CON-013) — 1 / serving
- Creamer (CON-015) — 1 / serving
- Stirrers (CON-014) — 1 / serving

## Arrival gift
| Item | item_code | Rule |
|---|---|---|
| Arrival Gift | GFT-001 | 1 per clean for SIGNATURE (and above). 0 for entry/SIMPLY tier. Tier-gated. |

## Linens / Towels (by guest or bathroom — verify against desired standard)
| Item | item_code | Rule |
|---|---|---|
| Bath towel (Mikado) | TWL-001 | 2 per guest |
| Washcloth (Mikado) | TWL-002 | 2 per guest |
| Hand towel (Mikado) | TWL-003 | 2 per guest |
| Bath mat (Opal) | TWL-004 | 3 per bathroom |
| Shower curtain | TWL-005 | 1 per bathroom |
| Kitchen towel | TWL-006 | 2 per clean |
| Kitchen washcloth | TWL-007 | 2 per clean |
| Kitchen potholder | TWL-008 | 1 per clean |

### Worked example — 3BR / 2BA / sleeps 8, PAR_CLEANS = 10
| Item | Per clean | Closet stock (×10) |
|---|---|---|
| Toilet paper | (2×2)+2 = 6 rolls | 60 rolls |
| Makeup wipes | 2×6 = 12 | 120 wipes |
| Shampoo | 2×2 = 4 | 40 |
| Conditioner | 4 | 40 |
| Body wash | 4 | 40 |
| Paper towels | 1 roll | 10 rolls |
| Dishwasher pods | 3 | 30 |
| Laundry packs | 3 | 30 |
| Coffee pods (pod-only) | 8×2.5 = 20 | 200 pods |
| Sugar / Creamer / Stirrers | 20 each | 200 each |

---

## ⚠️ KNOWN ISSUES TO FIX IN JOTFORM (verify forms match this spec)
- **Hybrid (BOTH) coffee pods:** JotForm is producing the FULL pod-only quantity
  (e.g. 14 for sleeps 6) instead of the hybrid split CEILING(SLEEPS × 1.25) (~8).
  Fix the BOTH branch in both forms. *(Discovered by comparing live data to spec.)*
- Ensure **Closet-to-Counter** and **Closet Visit** forms use the **identical**
  par formulas above (they must agree, or restock numbers will diverge on
  non-2-bathroom properties).

---

*Next SOP sections to add as we build: onboarding flow · certification walkthrough ·
laundry model · warehouse pull/pick · stock decrement & increment · dashboard ·
Stripe billing · house app setup.*

---

# 3. COST REFERENCE (aggregated — for P&L & value story)

*All costs live in Supabase. This is the computed summary. Costs are OWNER
pass-through (owner pays at cost); the subscription is Vellum's revenue.*

## Per-clean consumable cost (item_catalog × item_usage_rules)
| Property profile | Per clean | Annual (×40) |
|---|---|---|
| 3BR/2.5BA sleeps 6, BOTH coffee, Signature | ~$39.30 | ~$1,572 |
| 3/2 sleeps 6, PODS, Signature | ~$36.93 | ~$1,477 |
| 3/2 sleeps 6, BOTH, Signature | ~$37.00 | ~$1,480 |
| Entry 2/1 sleeps 4, PODS, no gift | ~$18.27 | ~$731 |

Biggest per-clean cost drivers: **coffee bags ($8.47), arrival gift ($10 placeholder),
paper towels, shampoo/cond/soap set.** (Update coffee→Soul Caffeine, gift→Atelier candle.)

## Linen laundering cost (linen_laundry_weights @ $1.20/lb)
| Property profile | Per turn | Annual (×40) |
|---|---|---|
| 3-bed (K+Q+F), 6 guests, 2.5 baths — no comforter wash | ~$28.78 | ~$1,151 |
| Same, WITH comforters washed | ~$39.10 | ~$1,564 |

Comforters/inserts typically NOT washed every turn (periodic). Poplin/local
wash-fold runs ~$1-1.50/lb (comparable). Managed laundry = charge owner this +
handling, OR connect owner to Poplin (launch model = connect, don't own).

## Linen purchase cost (item_catalog SHEETS + TOWELS)
One-time setup per property (initial linen stock). Key per-unit costs:
- King fitted $29.98 / flat $33.09 / pillowcase $5.92 / insert $23.17 / pillows(4) $20.76
- Queen fitted $18.88 / flat $26.35 / pillowcase $4.00 / insert $22.00
- Full fitted $23.76 / flat $26.35 / pillowcase $4.00
- Twin fitted $17.49 / flat $15.95 / pillowcase $3.38
- Bath towel $5.52 / washcloth $0.65 / hand towel $1.12 / bath mat $2.50 / shower curtain $12.75
- Vendors: BedBox (sheets), DZEE Textiles (towels), A1 American (inserts), Faire (kitchen)

## ⚠️ Cost updates still pending
- **Coffee bags**: $8.47 placeholder → real Soul Caffeine cost
- **Arrival gift (GFT-001)**: $10 placeholder → Atelier 880 candle ($19-28); decide staged vs keep-gift
- **Scenting**: catalog still has OLD Pura system (SCT-001/002/003) → replace with
  Atelier 880 Arrival (candle, diffuser+jug, room spray+jug). Deactivate Pura.
- **HostGPO comparison**: pull HostGPO prices → compare vs current (Zogics/Amazon/BedBox)
  to find bulk-amortized savings. (BedBox = done-for-you linen kitting, like the
  Vellum supply box — decide compete vs. use for linens.)

## Vendors currently in catalog
Zogics · Amazon · BedBox · DZEE Textiles · A1 American · Faire · FoodsTrade ·
Pura(retiring) · LaundryBags.com · At Home

---

# 4. LINEN MODELS — Beach vs. Mobile (IMPORTANT distinction)

## BEACH model (Vellum owns/fronts linens — the test data, PROP-001)
- Vellum fronts full linen cost (~$2,334 at 2-par for a 3-bed).
- Charges owner a smaller **linen fee** (e.g. $525), recoups balance over cleans.
- Uses `property_linen_inventory` recoup columns: `linen_fee_charged`,
  `net_linen_to_recoup`, `linen_recoup_cleans`, `linen_cleans_to_date`,
  `at_laundry_*` counts. Full reconciliation. Vellum's asset.
- More complex; ties up cash (fronting ~$1,800/property until recouped).

## MOBILE model (owner owns linens — LAUNCH model) ✅
- **Owner owns their linens.** NO linen fee, NO recoup, NO fronting, NO Vellum
  linen inventory tracking. Recoup columns stay dormant (Beach-only).
- Two cases per owner:
  1. **Owner keeps existing linens** (already operating, e.g. Maggie) →
     linen purchase = $0. Vellum just launders/manages what they have.
  2. **Owner upgrades to Vellum commercial linens** → one-time **pass-through
     purchase** at GPO pricing (optional small sourcing markup). Owner buys &
     owns them. Quote from the linen calculator; no fee/recoup.
- Much cleaner for launch: no carried inventory, no reconciliation, no cash tied up.

## Linen setup COST drivers (when an owner does buy)
- Cost scales with: bed config (K/Q/F/Twin counts), `par_sets` (2 or 3), and
  **towel generosity** (test spec = 24 bath / 24 hand / 24 wash at 2-par = ~12/set —
  that's the Beach standard; Mobile can spec leaner).
- Total linen cost example (3-bed, 2-par, generous towels): ~$2,334.
  A leaner Mobile spec is less. Real number depends on the towel-per-set rule.
- $480 = **HostGPO annual membership** (unlocks GPO pricing across ALL purchases) —
  NOT a linen cost. Pays for itself via total purchasing savings, not linen fees.

## Maggie (first Mobile target) — linen approach
- She's already operating (furnished, 88 reviews) → **likely keeps her own linens**
  at launch. Linen cost to her = $0; Vellum launders/manages.
- Optional upsell later: upgrade to Vellum commercial linens (Collector's Edition
  design tier could bundle this). Quote via calculator if/when she wants it.
- Need her exact bed config to quote a linen upgrade if she asks.

---

# 5. LINEN CALCULATOR — status & notes

**Files (spruce-portal repo):** `calculate-linen-order.html` (form) +
`api/calculate-linen-order.js` (logic) + `api/save-linen-order.js`.
Reads live costs from `item_catalog`; config (par levels, fee) from `spruce_config`.

**Calculator formulas (per bed, sheet_par=2, towel_par=3):**
- King: fitted ×2 · flat ×2×3 · pillowcase ×4×2 · insert ×2
- Queen: fitted ×2 · flat ×2×2 · pillowcase ×4×2 · insert ×2
- Full/Sofa: fitted ×2 · flat ×2×2 · pillowcase ×2×2 · insert ×2
- Twin: fitted ×2 · flat ×2×2 · pillowcase ×1×2 · insert ×2
- Towels: bath/wash/hand = sleeps × 3 · bath mats = bathrooms × 3 · kitchen towel/wash = 2 × 3

**Maggie (est. 1 King + 2 Full, 6 sleeps, 2.5ba, 3BR): ~$940.77** for a full new
linen setup. (She's already operating → likely KEEPS her own linens at launch;
this is an optional upgrade quote only.)

> ## 🔴 RED NOTES — DO NOT LOSE
> 🔴 **MISSING FROM CALCULATOR (add later, deferred for now):** shower curtains
> (TWL-005), kitchen potholders (TWL-008), laundry bags (MSC-001), mattress
> protectors (SHT-007), pillow protectors (SHT-006). These are in the catalog and
> in `property_linen_inventory` but the calculator does NOT add them yet. Setup
> quotes are therefore slightly UNDER a truly complete order. Add when expanding.
>
> 🔴 **LINEN FEE = BEACH ONLY.** In `spruce_config`, `linen_fee_per_bedroom` should
> ONLY be turned on (set to 175) for BEACH properties (Vellum owns/fronts linens,
> recoups via fee). For MOBILE (owner owns linens) it stays 0.
>
> 🔴 **CURRENT STATE (this session):** `linen_fee_per_bedroom` set to **0** in
> `spruce_config` — fee OFF until Sloan expands to a Beach/Vellum-owned model.
> The calculator still computes the order total; the fee/recoup outputs are just 0
> and are IGNORED for Mobile. Re-enable (175) per-property only when a Beach
> property onboards. Better long-term: make the fee a PER-PROPERTY field keyed to
> market (Beach=175, Mobile=0), not a single global config value.

---

# 6. LINEN ORDERING — actual status (verified in app)

**GOOD NEWS: more built than remembered.** The linen order is wired into the
**property drill-down page** (`admin-property.html?id=PROP-xxx`) via the
**"Calculate & Save Linen Order"** button. It:
- Pulls bed config automatically from the property (no manual entry)
- Calls `/api/calculate-linen-order` then `/api/save-linen-order`
- Saves per-property into `property_linen_inventory` (upsert, keyed by property_id)
- Shows $0 linen fee for Mobile (config change confirmed working)

There is ALSO a standalone `calculate-linen-order.html` (manual bed entry) — both
use the same API.

## DONE this session
- Added shower curtains (TWL-005, 1/bath), potholders (TWL-008, 2), laundry bags
  (MSC-001, 6) to `api/calculate-linen-order.js` + `api/save-linen-order.js`.
  (Deploy both files to spruce-portal /api/.)
- Maggie (1K+2F, sleeps 6, 2.5ba) complete order now ~$986.

## 🔴 STILL TO BUILD (bigger pieces — deliberate build, later)
> 🔴 **#4 ORDER STATUS TRACKING** — need columns on property_linen_inventory (or a
> new linen_orders table): order_status (draft/placed/received), order_placed_date,
> order_received_date, ordered_by. Then a status "mover" like the laundry dashboard.
>
> 🔴 **LINEN ORDER DASHBOARD** — list all property linen orders, their status, a
> mover (draft → placed → received → stocked). Model on admin-laundry.html.
>
> 🔴 **#5 CONSUMABLES ORDERING SYSTEM — THE MAIN WORKING DASHBOARD (big build).**
> Does NOT exist yet (only linens were built). Needs: who is low / what is low /
> what needs stocking (reads low_stock_alerts + property_stock + v_reorder views),
> the pick/checklist, warehouse pull, order placed/received, stock increment on
> delivery. This is the operational heart — build it carefully in its own session.
>
> 🔴 **PROTECTORS** — mattress (SHT-007) + pillow (SHT-006) protectors still NOT in
> the calculator (no DB column, don't wash per-turn). Add columns + logic when ready.
>
> 🔴 **CHECK PRICES** — verify item_catalog costs against real HostGPO/vendor pricing
> (Sloan's research; calculator auto-reflects catalog updates).

---

# 7. LINEN CALC — DATA QUALITY GOTCHA (important)

**The linen calculator is only as accurate as the property's BED CONFIG.**
It counts sheets from the property's king/queen/full_beds/twin/sofa fields. If
those are 0/empty, it produces **ZERO sheets** — only towels/bath/kitchen — and
the total looks suspiciously low.

**Real example found:** TP007 (PH112, 3BR/2BA/sleeps 6) saved a linen order of
**$155.23** — because its bed config was all zeros. With beds entered it would be
~$900+. The calc was correct; the DATA was incomplete.

> 🔴 **ONBOARDING RULE:** ALWAYS enter the bed configuration (# king/queen/full/
> twin/sofa) before running a linen order. Missing beds = short linen order =
> under-stocked property.
>
> 🔴 **IMPROVEMENT (later):** add a validation warning to the linen calc / property
> page — if total beds = 0, show "⚠️ No beds entered — sheets will be $0. Complete
> bed config first." Prevents ordering linens short for a real property.

**QC habit:** if a linen total looks too low for the bedroom count, check the bed
config first — it's almost certainly empty beds, not a calc error. (A 3BR should
land ~$900-1000; anything near ~$155 means no beds entered.)

---

# 8. 🔴 BUG FOUND: "Edit Property" doesn't actually edit

**Symptom:** clicking "Edit Property" on the property page opens a BLANK form;
entered data doesn't save / requires re-entering everything.

**Root cause (diagnosed):**
- `admin-property.html` line 36: the "Edit Property" button just links to
  `/add-property.html` with NO `?id=` and NO data load.
- `add-property.html` has NO logic to read `?id=`, fetch existing data, or pre-fill.
  So it's really the blank ADD form, mislabeled "Edit."
- `api/add-property.js` DOES upsert on property_id (line 47-51) — so the API side
  is fine; the bug is purely front-end (blank form + no ID passed).

**The fix (Option A — proper add/edit form):**
1. `add-property.html`: detect `?id=` in URL → fetch via `api/get-property-detail.js`
   → pre-fill ALL form fields with current values.
2. `admin-property.html`: change Edit button to `/add-property.html?id=PROP-XXX`.
3. Upsert API already handles save. No ID = blank = add mode (unchanged).

**Status: diagnosed, not yet fixed.** Until fixed, editing a property is broken —
can't update beds (which blocks correct linen orders), codes, wifi, etc.

---

# 9. 🔴 RUNNING PRIORITY LIST (flagged this session)

## Immediate technical (next few days — end-to-end debug/build sprint)
> 🔴 **1. FIX "Edit Property"** (Section 8) — proper add/edit form (detect ?id=,
>    prefill from get-property-detail, point Edit button at it). BLOCKS editing beds
>    → blocks correct linen orders. Do FIRST.
> 🔴 **2. REDEPLOY the added linen items** — deploy calculate-linen-order.js +
>    save-linen-order.js (curtains/potholders/bags) to spruce-portal /api/.
> 🔴 **3. CHECK LINEN COSTS** — verify item_catalog per-unit costs. Are commercial
>    linens cheaper per bed than Macy's/Target retail? (Should be YES via BedBox/
>    DZEE/GPO wholesale — confirm and document the savings as a VALUE story.)
> 🔴 **4. END-TO-END DEBUG/BUILD** (over next few days): the full operation —
>    onboarding → PAR → closet-to-counter → decrement → warehouse pull → order
>    placed/received → increment → dashboards. The consumables ordering system
>    (Section 6) is the big piece. Build carefully.

## Front-end / brand (parallel track while building)
> 🔴 **5. CONTRACTS** — front-facing certification/service agreement (draft → Trey).
> 🔴 **6. PULL HTML for Canva builds** — export/pull the Canva designs as usable HTML.
> 🔴 **7. HOUSE APPS** — the house app templates + per-property setup.

## Business setup (before "ready to kill it")
> 🔴 **8. Business license + tax license** (classify: certification+consulting+supplies).
> 🔴 **9. Insurance** (business/liability).
> 🔴 **10. Marketing materials** — order a few (business cards, QR placards, etc.).

## ⭐ THE LAUNCH MOVE (do not lose — highest ROI)
> ⭐ **MAKE MAGGIE'S CHAPEL THE FOUNDING SHOWCASE PROPERTY.**
>    Offer: collaborative redesign at a founding-member/discounted rate, IN EXCHANGE
>    FOR photo + video rights, a testimonial, and reference-property permission.
>    Payoff: portfolio before/after, proof-of-concept a block away, a Superhost
>    reference (4yr, 88 reviews), the design showcase that sells Collector's Edition,
>    and Sloan's art on the walls (photographed, sellable). The discount is the
>    best marketing spend available. Frame as an HONOR ("founding showcase").
>    Spanish-Baroque-meets-modern concept, oxblood + ochre/dusty-blue palette,
>    "let the inside finally answer that façade."

---

# 10. THE VALUE LOGIC & PITCH (do not lose — resolves the "why not just join HostGPO" fear)

## The core truth
Vellum does NOT compete on consumable unit price — and doesn't need to. You pass
supplies through AT COST (Vellum's wholesale/GPO pricing), which is an INTEGRITY
signal ("we don't mark up your supplies"), NOT the value. The VALUE is the
subscription: the system, curation, delivery, amenities, taste, and time saved.

- Full-service STR managers charge 20-40% of revenue ($11k-23k/yr on a $57k property).
  Vellum charges ~$2,148/yr. A FRACTION. You are arguably UNDERPRICED, not a scam.
- The worry "am I scamming?" is itself proof you're not. Test: is the owner better
  off? Yes on every axis (lower-than-retail supplies, time back, higher ADR). Legit.

## Why "they could just join HostGPO/Minoan" is NOT a threat
A GPO membership gives an owner a WHOLESALE PRICE LIST and nothing else. It does
NOT solve: SKU selection/curation, par levels, consumption tracking, reordering,
storage, delivery, cleaner coordination, linens, scent, house app, amenities,
design, or the standard. "They could join HostGPO" = "they could do their own
taxes / change their own oil." Access ≠ the job done.

You CANNOT beat their direct GPO price (you buy at the same price), so DON'T try.
Competing on price is the one dimension where you're structurally disadvantaged.
Compete on doing the WHOLE JOB, with taste, so they don't have to.

## The analogy that makes it click
Blue Apron / Stitch Fix don't beat retail prices — they sell curation + convenience
+ not-having-to-think. Nobody calls them a scam. Vellum is exactly this for STR
supplies + amenities + taste. The GPO pricing is a FEATURE included, not the product.

## The pitch (when an owner says "I could just join HostGPO myself")
"You absolutely could — and then you'd own the sourcing, tracking, reordering,
storage, and delivery of 40+ SKUs across par levels, every week, forever — plus
you'd still have to solve linens, scent, and amenities separately. Vellum is the
team that does ALL of it, curated to a boutique standard, delivered before you run
out, with the design and amenities that actually lift your ADR — for $179/month.
Your supplies pass through at our wholesale pricing; what you're paying for is never
having to think about it, and a property that earns more."

## Positioning one-liner
Vellum = a curated infrastructure-and-taste layer for STRs. Part GPO (wholesale
access), part done-for-you supply/amenity service (Stitch Fix curation), part
design/brand elevation. Supplies pass through at cost; the subscription is the value.

## ⚠️ Scalability guardrail
Subscription (consumables/linens/app/scent) = the SCALABLE engine. Design, floral,
tablescapes, photography = high-touch YOU services that don't scale past your hours.
Sell the artisan services as premium priced for your time; don't let them swallow
the scalable core. Know which is which.

## Still to nail (the one real gap)
Tier ladder: DON'T bake everything good into $179 or the anchor collapses. Define
real upgrade steps: The Edit ($179) / The Signature ($229, target) / Collector's
Edition ($299, anchor). Each tier needs a genuine reason to move up.

---

# 11. 🔴 TO RETIRE: old owner platform (Sheets-linked)

> 🔴 **RETIRE the old owner platform that was linked to Google Sheets.** An earlier
> version of the owner platform pulled data from / was wired to Google Sheets
> (pre-Supabase). It's superseded by the current Supabase-backed system. Needs to be
> deliberately decommissioned so there aren't two competing data sources / stale
> owner-facing surfaces.
>
> **Before deleting:** confirm nothing live still reads from it, and that all its
> data/logic is fully migrated to Supabase. Check for: old Sheets-linked owner
> portal page, any Apps Script / webhook feeding it, and any links pointing to it
> (owner emails, bookmarks, the old Spruce portal index).
>
> Careful/deliberate retirement — not urgent, but don't let it linger as a
> confusing parallel system. (Related: old Spruce "Owner Portal" index.html + any
> api/portal.js still present.)

---

# 12. 🔴 ARRIVAL GIFT — updated to Copper Key (check JotForms)

**GFT-001 is now:** Copper Ox Skeleton Key (4.25") w/ burgundy grosgrain ribbon,
**$5.00 landed cost** (was $10 candle placeholder). Tier-gated to SIGNATURE +
COLLECTOR'S EDITION only (NOT The Edit) — already enforced in item_usage_rules.
Depleted every stay (keep-gift). Sourcing: ~$4 unit, $150 min / free ship at $300.

Design: burgundy grosgrain ribbon = the standard (on-brand, immediate). Future
Collector's upgrade = copper wax-seal charm instead of ribbon. Removed the
religious charm the keys ship with (presumes faith).

> 🔴 **CHECK THE CLOSET JOTFORMS:** the arrival gift ("future SKU 1") may still show
> the OLD item (olive oils / earlier placeholder) in the Closet-to-Counter and
> Closet Visit forms. Update the JotForm wording/label to "Copper Key (Arrival Gift)"
> so cleaners/runners check for the right item. (Sloan must do — inside JotForm.)

---

# 13. 🔴 REBRAND: Spruce -> Vellum (before launch, cosmetic)

Old "Spruce" branding still appears in several places. All cosmetic / find-replace —
no logic risk. Do before launch (good fried-brain task). Known spots:
- **JotForm forms:** "Spruce Standard Amounts" language, form titles, any Spruce logos.
  (Closet-to-Counter / Amenities Set Out, Begin Clean, Complete Clean, Laundry, etc.)
- **Admin pages:** admin.html still says "Spruce Admin Dashboard"; other admin-*.html
  headers likely say Spruce.
- **owner-portal.html / index.html:** old "Spruce Owner Portal" wording.
- **Repo name itself:** github.com/sloan-prog/Spruce-Portal (can rename repo later, or
  leave — it's the internal repo name, not client-facing; Vercel URL is spruce-portal
  too. Client-facing is vellumhospitality.com, so the repo/URL name is low priority.)
- **Config/DB:** check for "spruce_config" table name, "Spruce" in any display strings.
  (Table NAMES can stay — internal; only DISPLAY strings that a user/cleaner sees matter.)

Rule of thumb: rebrand anything a CLEANER, OWNER, or GUEST sees. Internal table/repo
names can stay Spruce (or rename later) — not worth the risk/effort pre-launch.

---

# 14. ⭐ RULE: Stored Value vs. Display Label (plan tiers)

**THE RULE:** All LOGIC references the STORED VALUE. Only DISPLAY shows the pretty label.

| Stored value (logic uses this) | Display label (humans see this) |
|---|---|
| SIMPLY | The Edit |
| SIGNATURE | The Signature |
| CERTIFIED | The Collector's Edition |

**Logic that MUST check the stored value (SIMPLY/SIGNATURE/CERTIFIED):**
- JotForm conditions (e.g. show arrival gift if plan = SIGNATURE or CERTIFIED)
- item_usage_rules tier gating
- closet-to-counter webhook plan checks
- pricing / linen logic

**Display that shows the pretty label (The Edit / The Signature / The Collector's Edition):**
- Admin dropdowns (option value=STORED, text=pretty)
- Property page plan display
- Proposal / invitation / owner-facing anything

**NEVER change the stored enum values** (SIMPLY/SIGNATURE/CERTIFIED) — it would break
every piece of logic that checks them. The apostrophe in "Collector's" is especially
dangerous in code/DB matching. Value = for machines. Label = for humans. Never mix.

**Done 9/16:** JotForm arrival-gift condition fixed to check CERTIFIED (stored value),
not "Collector's Edition" (display words). ✓ Verify condition includes BOTH SIGNATURE
AND CERTIFIED (both tiers get the gift; The Edit does not).

---

# 15. 📋 TOMORROW NIGHT: Owner Portal review

Sloan hasn't touched owner-portal.html in months. Review it as its own focused
session (it's CLIENT-FACING — higher polish bar than back-office admin).

Things to check/do:
- Does it display the owner's PLAN TIER? If so, show the PRETTY LABEL
  (The Edit / The Signature / The Collector's Edition), NOT the stored value
  (SIMPLY/SIGNATURE/CERTIFIED). ← the client-facing label fix that matters most.
- Is it still on the OLD system / old data source? (Section 11: retire old
  Sheets-linked owner platform — confirm which portal is current.)
- Vellum branding (not Spruce) — it's client-facing, so this matters here.
- What does it actually show the owner? (property status, seal/certification,
  supply status, links, etc.) — decide what an owner SHOULD see.
- Auth still working (magic-link / login)?
- Is it the custom Supabase-backed portal (the one to keep) vs. any old version?

This is back-of-house vs front-of-house: owner portal = the owner's window into
Vellum. Should feel as polished as the invitation page.

---

# 16. SKU REORDER CLASSIFICATION (loaded to item_catalog 9/16)

Columns added to item_catalog: reorder_priority (DRIVER/RIDE_ALONG/SLOW),
reorder_point_cleans (driver trigger), reorder_every_bookings (time-based trigger).

**DRIVERS** (trigger a full box at **3 cleans left** — Mobile):
TP, paper towels, coffee pods, coffee bags, dish pods, laundry packs, dish liquid,
shampoo, conditioner, body gel/soap, makeup wipes, copper key (GFT-001, Sig/Collector's).
- NOTE: makeup wipes is a driver for QUALITY protection (stockout -> guests use
  washcloths for makeup -> ruined linens), not consumption speed. Smart.

**RIDE_ALONG** (top off when a box goes, don't trigger): sugar, creamer.

**SLOW** (rarely trigger): jet dry, stirrers ("can always use a spoon").

**TRASH BAGS (special):** SLOW priority BUT time-based trigger = refresh every ~30
bookings (reorder_every_bookings=30). Count-based won't work (nobody unrolls/counts
120 bags), so trigger on elapsed bookings, not current count.

**Trigger logic to build:** DRIVER hits 3-cleans-left OR trash-bag 30-booking timer ->
trigger a box -> top off ALL drivers + ride-alongs to par -> add slow items only if
they're below their own threshold. (Mobile = 3 cleans; other markets = higher, TBD.)

---

# 17. PACKAGING — boxes + repackaging (legal note)

## Box strategy (cost-smart, Stitch Fix look)
3 boxes per delivery: case of TP, case of paper towels, small box of little items.
DON'T custom-print all 3 (expensive at scale). Instead:
- **Plain kraft/white boxes** (or reuse supplier cases) for the bulk TP/paper towels
- **Brand with custom STICKERS (oxblood wax-seal) + custom TAPE** = Stitch Fix look for
  ~10% of custom-box cost. THE trick.
- **ONE nice custom-printed mailer box for the small AMENITIES box** (copper key, scent,
  welcome) — the "unboxing wow." Spend the branding budget HERE.
Vendors: stickers/tape/tissue = BoxUp, Packlane. Nice mailer box = Packlane, Packwire.
Eco option = EcoEnclose (100% recycled, made USA). Test small = Totally Promotional,
Custom Boxes Lab (low/no minimums).

## Repackaging — legal (RUN PAST TREY)
Not legal advice — confirm with Trey (AdamsIP).
- ✅ CAN: curate + deliver BRANDED goods in a Vellum box (Stitch Fix model — not
  claiming you made them). Cottonelle IN a Vellum box = fine.
- ✅ CAN: private-label genuinely BULK/UNBRANDED supplies (bulk shampoo -> Vellum bottle)
  = standard hotel-amenity private label, generally OK.
- ❌ CANNOT: relabel a specific NAMED brand as "made by Vellum" (Cottonelle rolls
  relabeled "Vellum toilet paper" = misrepresentation).
- Rule: curate/deliver branded goods (safe) + private-label bulk goods (safe) =
  YES. Rebrand a named brand as your own manufacture = NO.
- Extra caution on anything GUESTS CONSUME (labeling rules). Ask Trey.

---

# 18. THE NOTECARD (in the supply box — Stitch Fix touch)

A small wax-seal card in the supply box. OWNER-facing (B2B) — it's a beautiful
"delivery note," not a guest welcome. Pure Vellum (correspondence/seal brand).

**Wording (pick/refine when ordering cards):**
- Header: "Your Vellum Certified Items"
- Warm line: e.g. "Kept to standard, delivered with care." / "Everything replenished
  to your Vellum standard."
- Thank-you: "Thank you for being part of the collection."
- Tagline tie-in: "a standard worth belonging to" or "Before the key turns…"
- Sign: — Vellum Hospitality

Leading candidate:
> **Your Vellum Certified Items**
> *Kept to standard, delivered with care.*
> Thank you for being part of the collection.
> — Vellum Hospitality

**Practical:**
- **Printed faux-wax-seal** (Certified-C image on cream cardstock) — NOT real wax for
  repeat supply boxes (real wax = labor; save it for one-time special moments like the
  invitation / Collector's welcome). Printed oxblood seal reads beautifully + scales.
- Consider a warmer FIRST-delivery version ("Welcome to the collection") vs. the
  standard replenishment card.
- Order alongside stickers/tape (BoxUp/Packlane). Launch-polish, not a blocker.

---

# 19. 🔴 OWNER PORTAL BUG (found 9/17): first-login auth linking

**Symptom:** logging in gives "This email isn't linked to an owner account yet" even
though the owner record exists with the right email.

**Root cause:** the portal matches owner via RLS policy owner_reads_self
(owner_id = auth_owner_id()), and auth_owner_id() = `select owner_id from owners
where auth_user_id = auth.uid()`. It matches on **auth_user_id**, NOT email. But owner
records are created during ONBOARDING (before the owner ever logs in), so auth_user_id
is NULL — and nothing ever sets it. Result: EVERY real owner hits "not linked" on first
login.

**Manual fix used for Sloan's test:** set owners.auth_user_id = the auth.users.id for
that email (matched by email in auth.users).

**PROPER FIX FOR LAUNCH:** on first successful login, link the account —
after auth succeeds, if the logged-in email matches an owner_email whose auth_user_id
is null, UPDATE owners SET auth_user_id = auth.uid() for that row. Options:
- Do it in portal.js after verifyOtp (needs an endpoint or an RPC, since RLS blocks the
  update from client), OR
- A SECURITY DEFINER function `link_owner_on_login()` the portal calls once after login
  that self-links by matching auth.email() to owner_email.
Without this, onboarding must manually set auth_user_id, which won't scale.

---

# 20. ⭐ FINALIZED PRICING MODEL (locked 9/18)

## Tiers (monthly subscription, Vellum's revenue; supplies pass through at cost)
| Tier | Price | Stored value | Margin (60 bkg, before mktg) | Net (after 20% mktg) |
|---|---|---|---|---|
| The Edit | $179 | SIMPLY | $2,013/yr (94%) | $1,583 (74%) |
| The Signature | $229 | SIGNATURE | $2,613/yr (95%) | $2,063 (75%) |
| The Collector's Edition | $329 | CERTIFIED | $3,813/yr (97%) | $3,023 (77%) |
- Onboarding fee: $199 flat, one-time (year 1).
- Serve cost/property ~$135/yr (boxing ~$72 at $8/box x ~9 boxes + scent ~$63).
  Supplies + copper key PASS THROUGH to owner at cost (not Vellum cost).

## What each tier includes
- **The Edit $179:** Vellum Certified standard + seal · consumables to par · signature
  scent (Arrival) · hotel-grade linens · COPPER KEY (all tiers) · TV welcome screen
  (all tiers) · Never a Bare Shelf. NO add-on access.
- **The Signature $229:** everything in Edit + The House App + priority replenishment/
  support + ADD-ON ACCESS (florals, tablescapes, laundry concierge à la carte).
- **The Collector's Edition $329:** everything in Signature + design consultation +
  premium supply upgrades + quarterly styling refresh + concierge/priority + all add-ons.

## Add-ons (Sig + Collector's only — GATED OUT of Edit to drive upgrades)
| Add-on | Price | Cost | Margin | Lead time |
|---|---|---|---|---|
| Florals | $50/booking | $25 | $25 | 96 hrs |
| Tablescapes | $150/styling | $100 one-time (REUSABLE asset) | ~$150 (after acquisition) | 96 hrs |
| Laundry concierge | $60/turn | ~$34 | ~$26 | 48 hrs |
- Charged to owner's STORED CARD ON-EVENT (never float/net-30).
- **48/96-hr LEAD TIME = the key: track REQUESTS, not their booking calendar. No iCal
  integration needed.** Owner/guest requests -> Vellum fulfills.

## Pricing STRATEGY (why the numbers are what they are)
- Signature = the VOLUME/TARGET tier (scalable, high-margin, "most popular"). Add-on
  gating drives Edit->Sig (each upgrade = +$600/yr higher margin).
- Collector's = CAPPED PREMIUM. Priced with a BIGGER jump ($229->$329, +$100) ON PURPOSE:
  its premium is DESIGN/CONCIERGE/STYLING = SLOAN'S LABOR (time, not cash), which does
  NOT scale past her capacity. Bigger price = fewer takers = manageable + each pays real
  money for her irreplaceable eye. High price also anchors Signature as the smart middle
  + reinforces "only a handful of homes" FOMO.

## Path to replace pharmacy (Signature typical, net after 20% mktg, minus $3,420 tech)
- ~22 properties = lean pharmacy (~$42,840/yr) | ~43 = full (~$85,680/yr).
- Against 78 identified prime Mobile targets: lean = <1/3 of market. Achievable.
- 20% marketing is FRONT-LOADED launch spend; drops as scale grows -> margins improve.

---

# 21. PRICING VALIDATED vs. market (researched 9/18)

**Full-service STR management, Gulf Coast real rates (2026):** 18-25% avg, up to 30%,
luxury 40%+ — often PLUS onboarding/linen/photo/marketing fees. Sources: The Short
Term Shop, Alabama Gulf Coast Guide, Prickett, One Fine BnB, TIDY.

**On a $57K property (Vellum's validated Mobile median):**
- Full-service avg (25%) = $14,250/yr | luxury (40%) = $22,800/yr
- Vellum Edit $2,148 = 3.8% | Signature $2,748 = 4.8% | Collector's $3,948 = 6.9%
- Vellum's TOP tier saves an owner ~$10,300/yr vs avg full-service, owner keeps 100% control.
- Even flagship = ~1/5 the cost of avg full-service. The Edit ~1/7.

**THE HONEST POSITIONING (this is the sharp part):**
Full-service does BOOKINGS/guest-comms/listing; Vellum does NOT. So it's NOT
apples-to-apples. Vellum = the SUPPLY + STANDARD + TASTE layer for owners who
SELF-MANAGE (or use a cheap half-service tool like TIDY 3.9% / Evolve, which don't
do cleaning/supplies). Positioning:
1. vs full-service (20-40%): dramatically cheaper + owner keeps control.
2. vs DIY self-manager: Vellum is the ONLY curated+taste+managed-supply option that
   EXISTS. Not undercutting a competitor — CREATING a category.
3. vs half-service (bookings only): those owners STILL need the supply/standard/amenity
   layer = exactly Vellum.

**Pitch line:** "Why give a manager 20-25% when you can self-manage and let Vellum
handle the supplies, standard, and taste for under 7% — and keep control of your home?"

---

# 22. OBJECTION HANDLING (have these nailed before pitching)

## Objection 1: "I'd buy the supplies anyway — what am I paying the subscription for?"
TRUE: supplies are the owner's cost either way (pass-through). The subscription is
NOT for the stuff — it's for everything AROUND it:
- Sourcing/logistics labor (their TIME back — no researching, ordering, tracking,
  receiving, storing, restocking every week forever)
- Wholesale/GPO pricing (supplies may be CHEAPER through Vellum than DIY retail)
- Taste/curation (boutique standard they can't assemble themselves)
- The system/consistency (par mgmt, decrement tracking, never-a-bare-shelf =
  revenue protection: a self-manager runs out -> bad review)
- The standard + seal + ADR lift (a Vellum home earns more / reviews better)
**Blue Apron frame:** you'd buy groceries anyway; you don't pay Blue Apron for the
food, you pay for curation + not-having-to-plan. Same logic.
**Pitch:** "We're not selling you toilet paper. We're selling you the standard, the
taste, and your time back — for under 7% of what your property earns. And the
standard we bring earns you more than the fee (one extra booked night/month covers it)."

## Objection 2: "I'll just join HostGPO / Minoan myself for the wholesale pricing."
- **HostGPO** = a group-purchasing ORG. A ~$480/yr membership that unlocks a WHOLESALE
  PRICE LIST. That's all. YOU still source, select, order, track, receive, store,
  restock, deliver — every week, forever.
- **Minoan** = a curated MARKETPLACE (trade pricing + guest-purchase commissions). A
  BUYING/upsell platform, NOT a managed service. Still: you pick, order, manage par,
  restock.
- **KEY TRUTH: both give ACCESS to pricing. NEITHER does the JOB.**
- They do NOT: curate to a standard, manage par, track consumption, reorder before
  empty, kit/deliver boxes, run the scent/linen/key/styling programs, hold the
  standard+seal, or bring the design eye that lifts ADR.
- **Costco analogy:** HostGPO/Minoan = a Costco card. Vellum = a private chef who
  shops Costco FOR you, plans the menus, stocks to par, and cooks. "I could get a
  Costco card myself" — yes, then do all the work.
- **KICKER:** Vellum likely buys THROUGH GPO pricing and passes it to the owner. So
  they get the wholesale pricing THROUGH Vellum anyway — PLUS the whole operation +
  taste. Joining themselves gets the price list and NONE of the operation, plus all
  the labor back on their plate.
- **Don't compete on unit price** (you can't beat their direct GPO price and don't
  need to). Compete on doing the whole job, with taste, so they don't have to.

---

# 23. PAYMENT STACK (launch = no custom billing code) + "Request a Flourish" form

## Launch payment stack — ALL no-code
| Money type | How collected at launch |
|---|---|
| Onboarding fee ($199 one-time) | JotForm Proposal Payment + Stripe (one-time charge) |
| Monthly subscription ($179/229/329) | Stripe DASHBOARD, set up BY HAND per client (create Customer + Subscription to the tier's Price). No code needed for first clients. |
| Add-ons (florals/tablescapes/laundry) | "Request a Flourish" JotForm + Stripe Checkout — PAY ON REQUEST |
- Set up 3 Stripe Products w/ monthly Prices: The Edit $179, The Signature $229,
  The Collector's Edition $329. Subscribe clients manually until volume justifies the
  automated engine.
- Automated subscription engine = LATER build (own stack), when manual gets tedious.

## "Request a Flourish" add-on JotForm (build this weekend, no code)
Fields:
1. Service dropdown: Florals / Tablescapes / Laundry Concierge (sets the price)
2. **Requested date field — GATED by lead time** (the key operational safeguard)
3. Property
4. Optional notes
5. **Stripe Checkout** — pay on request (money in hand before fulfilling; no float,
   no stored-card complexity — cleaner than charge-on-event)
6. Lead-time note displayed
7. JotForm notification -> Sloan fulfills within lead time

**The date gate (Sloan's insight):** use JotForm's Date field minimum-date setting so
the owner CANNOT select a date sooner than the lead time. Options:
- SIMPLE (launch): one date field, minimum 96 hrs out for ALL add-ons. Foolproof.
- REFINED (later): conditional per-service date fields — Florals/Tablescapes 96 hrs,
  Laundry 48 hrs (condition on the service dropdown reveals the matching date field).
This enforces operations IN the form — owner can't request faster than Vellum can
deliver to standard. No awkward "we can't do that in time" — the calendar just won't
allow it.

**Add-ons gated to Sig + Collector's** (not Edit) — drives Edit->Sig upgrades.
Put the "Request a Flourish" button in the owner portal + House App.

---

# 24. AUDIT SCOPE + COFFEE SERVICE (brand) (9/19)

## Every-clean audit scope
Cleaner counts the 12 DRIVERS every clean (fast-movers that trigger boxes):
copper key, body gel, coffee bags, coffee pods, conditioner, dishwasher pods,
laundry packs, dish soap, makeup wipes, paper towels, shampoo, toilet paper.
SLOW items (stirrers, sugar, creamer, jet dry, trash bags L+S) = NOT counted every
clean; checked at the periodic delivery audit only. (Sugar + creamer moved DRIVER/
RIDE_ALONG -> SLOW: huge counts, slow move, don't trigger boxes.)

## 🔴 BRAND FLAG: elevate the coffee service (the "hmmmm")
Individual packet sugar + plastic creamer cups read HOTEL-BREAKFAST-BAR / gas-station,
NOT boutique-hotel. They break the Vellum spell (beautiful scent, linens, copper key...
then Domino packets + Coffee-mate cups). Premium coffee service = FEWER, NICER things.
Options:
- **Coffee:** Soul Caffeine (premium local) = already the elevated star. Let it carry it.
- **Sugar:** upgrade to nicer individual packets (raw/turbinado in kraft paper) — still
  sealed/hygienic but reads considered. OR a small glass jar of raw sugar w/ spoon (nicer
  but needs maintenance; can get messy/walk off in an STR).
- **Creamer:** consider DROPPING individual cups entirely (least premium, freshness/
  spoilage issues, good coffee doesn't need them). OR a shelf-stable premium option.
- Ethos: "less, but better." A gorgeous bag of local coffee + raw sugar + good mugs
  reads FAR more luxurious than a Keurig surrounded by packets/cups.
Tension: premium presentation (jar) vs. hygienic/practical (sealed packets). Both valid.
DECISION PENDING — a sourcing/taste call, not inventory. But worth doing before launch:
the coffee corner is a guest touchpoint.


---

# 25. COFFEE SERVICE nuance: the half-and-half review (9/19)

Real data point: ONE review mark, once — "no half-and-half for the espresso machine."
(One-off, tiny ding — NOT a pattern. Don't over-rotate. But useful signal.)

**The insight:** the complaint was about REAL half-and-half for ESPRESSO, from a
higher-end guest — NOT about plastic creamer cups. A guest that sophisticated would be
MORE put off by cheap cups than by nothing. So the review SUPPORTS elevating, not adding
convenience creamer.

**The fix (premium + matches the guest):**
- Real HALF-AND-HALF as a PER-TURN FRESH item (small carton in fridge, replaced each
  turn like fresh florals — perishable, not closet stock) for espresso-equipped homes.
- OR a good SHELF-STABLE premium half-and-half single-serve (not the cheap cups).
- Note in House App: "Fresh half-and-half stocked for your arrival."

**Strategic frame:** this ding is a MINI-CASE-STUDY FOR WHY VELLUM EXISTS. Self-managing
owner shrugs at it; a Vellum home has a SYSTEM ensuring the coffee/espresso corner is
handled. Difference between "nice place that forgot the half-and-half" and "every detail
considered." USE IT in the pitch.

Operational note: fresh half-and-half = a turnover fresh-stock task (per-turn), separate
from closet inventory. Only for espresso/coffee-equipped properties.


---

# 26. PROCUREMENT TO-DO (sourcing list, 9/19)

Items added to catalog as placeholders — SOURCE + price them:
- **CON-018 Half & Half** — shelf-stable single-serve real dairy. Baseline = Land O'Lakes
  Mini Moos; PREFER a finer/Euro-looking brand if found (presentation matters — reads
  premium, not breakfast-bar). Solves the espresso half-and-half review ding. Ships in
  the regular closet box, no refrigeration/spoilage until guest opens. Present in a small
  dish/tray, not scattered.
- **CON-019 Raw/Turbinado Sugar** — premium packets (kraft paper) or a small jar w/ spoon.
  Elevates the coffee corner vs. Domino packets.

Existing sourcing still open:
- **Atelier 880** — Arrival scent (candle/diffuser/spray) — reply w/ shipping address for
  $1 tealight samples; confirm 5:3:2 amber-patchouli:leather:tobacco formula.
- **Soul Caffeine** — real coffee bag cost (update CON-017 from $8.47 placeholder).
- **Copper keys (GFT-001)** — first MOQ order (~$4/key, $150 min / free ship $300),
  burgundy grosgrain ribbon; remove religious charm.

Presentation principle for the coffee corner: "less, but better." Soul Caffeine coffee +
real half-and-half (nice brand) + raw sugar + good mugs, styled on a small tray = boutique,
not convenience-store.

---

# 27. PROGRAMA — Collector's Edition design tool (Phase 2, researched 9/20)

**What it is:** professional interior-design management platform (by designers, for
designers). Spec sheets, purchase orders, invoices, live shareable schedules, trade
pricing/markups, clip-from-supplier product library, and a STUDIO-BRANDED CLIENT PORTAL
(clients view/comment/approve per line item, no logins; you control pricing/supplier
visibility per view). QuickBooks integration. ~4.8/5 reviews. Free trial, no CC.

**Pricing:** ~$99-199/mo (month-to-month $89 + $39/seat; annual cheaper).

**FIT for Collector's Edition:** genuinely good — it's built for exactly the "present a
design vision + client approval" moment. Elevates the 5-slide Canva deck to a live pro
tool; makes Vellum look established, not solo-with-Canva.

**CAUTION / sequencing:**
- It's a recurring cost with NO Collector's client yet. DON'T subscribe pre-revenue.
- Overkill at launch — built for design STUDIOS doing full FF&E; Collector's is lighter
  (styling/refresh/curation). Canva 5-slide deck (free, known, ready) is ENOUGH for the
  first Collector's client.
- **Plan:** launch Collector's with Canva deck. Use Programa's FREE TRIAL strategically
  on the first real Collector's client (pro presentation, $0). Subscribe only when 2-3
  design clients make per-client Canva tedious OR a client wants a full design project,
  and design revenue covers the fee.
- One-liner: "Canva deck LAUNCHES Collector's Edition; Programa SCALES it."


---

# 28. FUNDING THE ATELIER FLOAT (9/20)

The one real working-capital need = the atelier float (cash tied up in stock-on-hand
between buying it and owner reimbursement). Funding a cushion upfront turns the float
from a tightrope (buy -> wait -> hope reimbursement lands before next buy) into a buffer
= removes cash-flow stress AND peace of mind (esp. re: Sloan's rumination). Worth doing.
BUT the float is small + self-replenishing by design, so likely need LESS than it feels.

## Layer the cushion, smallest-commitment first:
1. **Onboarding fees ($199)** — FREE cushion, comes at signing (cash-positive at start of
   each client, before much is spent on them). Modest but helps every new property.
2. **Bounded personal cash injection** — a DEFINED, CAPPED amount ("I'll float $X"), NOT
   open-ended. Draw the line so the business float doesn't erode personal safety net
   (the 17-mo runway / reserves Sloan armored).
3. **Son's father capital injection** — nice additional buffer, aligns w/ "son inherits
   this business" vision. BUT STRUCTURE CLEANLY (family/co-parent money):
   - Define it: GIFT (clean, no obligation, put in writing) vs LOAN (repayment terms) vs
     EQUITY (a STAKE -> co-owner -> affects control + the son-inherits plan). Very
     different structures.
   - Is he funding FOR the son (son's inheritance/stake) or investing IN Sloan? Different
     ownership implications. Clarify.
   - PUT TERMS IN WRITING (Trey) even between amicable co-parents. Clarity PROTECTS the
     relationship — undefined family money is how "for our son" becomes conflict later.

## Related: the "son inherits" vision deserves real structure (Trey)
Worth building the ownership/succession structure thoughtfully NOW (with Trey, during the
IP/contract pass) so the son-inheritance vision is real and protected, not just a hope.
Its own worthwhile Trey conversation.


---

# 29. COFFEE: PODS ELIMINATED — ground only, all tiers (9/21)

"This is not the Holiday Inn Express." Pods (Keurig) read mass-market/breakfast-bar,
not boutique. DECISION: eliminate pods entirely. ALL Vellum homes get GROUND coffee
(Soul Caffeine, the good stuff) — one coffee line, all tiers.

**Changes made:**
- CON-016 Coffee Pods -> DEACTIVATED (item + usage rule).
- CON-017 Coffee Bags (GROUND) -> the only coffee. 1 bag/clean, all properties.
- ALL properties set coffee_type = GROUND (fixed nulls incl TP007 — that was why RUN
  PAR showed no coffee: null coffee_type = nothing populated).
- KILLS the old hybrid-pods calc bug (no pods = no hybrid math). That whole branch is gone.

**Why "everyone gets the good stuff" (not tiered Gevalia-for-Edit):**
- Vellum Certified = the standard is the standard. A weak-link grocery coffee dents the
  brand even at entry tier (coffee is a guest touchpoint — see half-and-half review).
- Coffee is pass-through (owner pays) — premium coffee for all costs Vellum NOTHING.
- One SKU / one sourcing relationship / one par calc = operational simplicity.
- Tiers already differentiate on copper key (Sig+), House App (Sig+), add-ons (Sig+),
  design (Collector's) — no need to cheapen Edit's coffee.

**Equipment note (intake):** coffee is ground -> property needs a DRIP / pour-over /
French press (not a Keurig-only setup). INTAKE should ask about COFFEE EQUIPMENT so we
know the property can brew ground. If a property is Keurig-only, that's an onboarding
fix (provide a brew method), not a reason to stock pods.

**REMAINING TO-DO from this catch:**
- Intake form: add COFFEE EQUIPMENT question (drip / pour-over / French press / espresso).
- Amenities Set Out + Audit JotForms: remove pod fields (pods retired); coffee = bags only.
- RUN PAR: re-run on TP007 now that coffee_type=GROUND — coffee bags should populate.

---

# 30. TEST PROPERTY CLEANUP (pre-launch task, 9/21)

Test properties are scattered/messy. TP007 = "PH112" (Phoenix V unit 112, Sloan's main
test property). Current 8 test properties:
- PROP-001 Sample Condo (Sample Owner) - seed
- PROP-002 Test Property 1 (Sloan/OWN-004, set CERTIFIED for portal demo)
- PROP-003 Oasis 555 (Kelly Smith)
- PROP-004 Oasis 101 (Sloan/OWN-004) - main portal demo, has decrements
- PROP-005 TURQUOISE PLACE - ORPHANED (no owner, no market)
- TP006 Test Property 6 (Julian Westfall)
- TP007 PH112 (SLOAN WESTFALL) - main test property
- TP6 Test Property 6 (Sample Owner) - DUPLICATE of TP006

Mess: dup "Test Property 6" (TP006/TP6), orphaned PROP-005, inconsistent IDs
(PROP-00X vs TPXXX vs TP6), all beach/null market (no real Mobile props).

**DON'T delete now** — PROP-002 & PROP-004 are linked to Sloan's owner account for the
working portal demo; TP007 & PROP-004 have active test data (decrements/RUN PAR). Deletes
cascade (stock, closet subs, linen orders, owners) — careless delete breaks things.

**CLEANUP PLAN (do right before onboarding Maggie):**
1. KEEP 1-2 as permanent sandbox: TP007 + PROP-004 (most test data + portal link).
2. DEACTIVATE the rest (active=false) — vanish from views, data preserved. Safer than delete.
3. Once real Mobile props onboard, fully delete/archive the test ones.
4. Standardize real property IDs going forward (e.g. MOB-001) + real owner records.
Do the deactivation pass so admin views are CLEAN when real data arrives.

---

# 31. ⭐ COFFEE STANDARD (confirmed 9/21) + morning to-do

**ALL EDITIONS get BAGGED GROUND COFFEE ONLY.** (The Edit, The Signature, The
Collector's Edition — every tier.) No pods. No Keurig. Ground Soul Caffeine, brewed.
"This is not the Holiday Inn Express." One coffee line, all tiers, pass-through cost.

## 🔴 MORNING TO-DO (Sloan, before/while finishing JotForm)
- **Stirrers STILL showing in the HTML/form** (and generated 200 qty) — the stirrer field
  needs REMOVING from the JotForm(s). CON-014 is deactivated in the catalog but the FORM
  still has the field. Delete the stirrer field from Amenities Set Out + the Audit form.
- **Remove pod fields** from the JotForm(s) too — pods retired (CON-016 deactivated).
  Coffee = ground bags only.
- Re-run RUN PAR on TP007 (coffee_type now GROUND) — coffee BAGS should populate.
- Finish the Audit JotForm (clone/edit in progress) — driver COUNT fields, carries
  property_id, non-skippable. Grab field IDs when done -> wire the overwrite webhook.

---

# 32. THE NORTH STAR — the 500-property vision (9/21)

Sloan's end-state vision: a warehouse that DOUBLES AS A SHOWROOM, travel ONLY to the
Collector's Editions, Vellum becomes a mail-packing + procurement + taste business.
Son inherits it.

**HONEST MATH (500 properties, mixed tiers ~30% Edit / 55% Sig / 15% Collector's):**
- Gross subscription: ~$1.37M/yr
- Loaded overhead (warehouse/showroom $60k, ~6 staff $270k, serve $100k, software,
  8% mktg): ~$554k
- **NET ~$820k/yr** — and that's BEFORE add-ons, onboarding fees, supply markup, and
  the in-stay STORE (art/scent/coffee across 500 homes).
- So "$500K net" is CONSERVATIVE. $500k is roughly the FLOOR at 500 properties.

**WHY THE VISION IS SOUND (not fantasy):**
- It's the natural GROWN-UP version of what's being built RIGHT NOW. The warehouse ops
  dashboard, two-tier inventory, par-triggered boxing = the mail-packing procurement
  business at small scale. Same bones, scaled.
- "Only travel to Collector's" = correct division: SYSTEM scales the standard (staff pack
  boxes, triggers fire, standard holds on Edit/Sig); SLOAN scales the TASTE (reserves
  herself for the design work only she does). System scales standard, Sloan scales taste.
- Warehouse-as-showroom = procurement hub + brand experience (owners visit, see scents/
  linens/art). The atelier grown.
- Becomes a procurement + logistics + taste business = defensible, systematized,
  SELLABLE/INHERITABLE (son). A real asset, not a job.

**THE PATH:** Mobile -> prove it -> adjacent markets -> warehouse/showroom -> regional
procurement-and-taste business the son inherits. The foundation being built this week
(self-correcting inventory, two-tier warehouse, par system, tiered service) IS the engine
of the 500-property version. Building the right thing.

---

# 33. LINK/QR AUTO-GENERATION + open wiring notes (9/21)

## Link/QR generation — now AUTOMATIC (built into add-property.js)
Previously: per-property JotForm links were populated by ONE-TIME SQL (no generator).
NOW: add-property.js auto-generates ALL form links + QRs on every property add AND edit,
from the property's current data. Forms included: closet_to_counter, AUDIT, begin_clean,
complete_clean, laundry, non_urgent, cleaning_task_1. QRs = QR-service URLs
(api.qrserver.com/...?data=<link>) that render on demand (no image gen / no Apps Script).
- Add a property -> all links+QRs build instantly (no manual SQL). Prevents onboarding a
  real client (Maggie) with no cleaner links.
- Edit a property -> links REFRESH with current data (tier/coffee change flows through).
- Existing test properties: re-save (edit->save) to regenerate their links through the new
  system (they were populated by old SQL). Not urgent.
- The "how do links get made?" mystery = solved. It's in add-property.js now, self-contained.

## ✅ ISSUE SYSTEM — WIRED, with the RIGHT access design (9/21)
Both webhooks confirmed wired (Sloan's sticky note was right):
- api/urgent-issue.js -> raw_urgent_issues (smart property-matching by unit/building)
- api/non-urgent-issue.js -> raw_non_urgent_issues

**ACCESS DESIGN (key — they differ ON PURPOSE):**
- **NON-URGENT** = reported from INSIDE THE CLOSET (property). Per-property QR/link.
  Cleaner at property notices something minor -> scans closet QR. IS in the add-property
  auto-generator (form 253514722122043). Correct.
- **URGENT** = STANDALONE emergency form (253604637017051), NOT per-property prefilled,
  NOT in the cleaner app. Deliberately OUTSIDE the normal flow so it works when the
  cleaner CAN'T get in (lockout) or there's flood/fire/guests-inside. Cleaner accesses it
  independently (card/phone/bookmark) + SELECTS the property in the moment. So: one
  standalone urgent link, NOT per-property. urgent_link/urgent_qr columns exist but are
  CLEARED/dormant (per-property prefill was the wrong mechanism - removed from generator).
  Smart design: urgent works precisely when the normal property-access path is broken.

---

# 34. ⭐ STRATEGIC: maybe Vellum doesn't OWN the cleaning (9/22)

Sloan's realization: "if this works, I MIGHT not be doing cleaning at all."

**The insight:** Vellum's core value = the STANDARD + supply system + taste + certification,
NOT the cleaning labor. Cleaning is the un-scalable, high-liability, high-headache part
(staffing, no-shows, quality, workers comp, turnover) where STR service businesses drown.

**THE MODEL: certify the OWNER'S existing cleaner to the Vellum standard** (train them,
give them the forms/QRs/checklists, audit their work) — rather than EMPLOYING cleaners.
Vellum = the standard + supply + system + audit layer OVER their cleaner, not the cleaning co.

**Why it's likely better:**
- Sheds the hardest operational burden (no cleaner payroll/coordination/liability).
- Fits the "Vellum Certified" thesis perfectly: not "we clean it" but "this home MEETS
  the Vellum standard." Cleaner executes; Vellum certifies + supplies.
- Asset-light, margin-rich (90%+ gets even cleaner, no cleaner payroll).
- Difference between a CLEANING COMPANY and a STANDARDS/INFRASTRUCTURE company — the
  latter scales far better, worth more, more inheritable/sellable.
- The AUDIT FORM is exactly the tool: owner's cleaner does set-out + audit via Vellum's
  forms/QRs -> Vellum gets data, triggers boxes, certifies — without employing anyone.
  The forms are how the standard is maintained through someone else's hands.
- The audit form is CLEANER- and MARKET-AGNOSTIC. Whoever cleans, does the audit.

**HONEST SEQUENCING (don't decide the whole pivot tired):**
- Likely START by doing/controlling cleaning for first few Mobile properties (prove the
  standard, build the playbook), THEN shift to certifying owners' cleaners as you scale.
  Do cleaning early to LEARN it; certify it later to SCALE it.
- Both models viable: OWN cleaning (more control/revenue, operational burden) vs CERTIFY
  others' cleaning (asset-light, scalable, less clean-control). Decide clear-headed, not
  on a tired Monday.

## Form housekeeping (from this session)
- Live Mobile audit = "FINAL AUDIT OF VELLUM ITEMS" (262628561852161) -> closet_audit table.
- OLD "CLOSET AUDIT" form (261124812931148) = ORPHANED: 0 submissions, in NO code, NO
  property links, has stale items (pods, stirrers, olive oil). Rename it "OLD/ARCHIVE -
  do not use" in JotForm for clarity (don't delete). The Final Audit form works for ANY
  cleaner/market (Mobile or Beach) — whoever cleans, uses it.


---

# 35. ⭐⭐ THE BUSINESS, CLARIFIED: "Stitch Fix for STRs" (9/22, considered - not tired)

Sloan has genuinely pondered this (not a tired impulse): Vellum = an ELEGANT STITCH FIX
FOR SHORT-TERM RENTALS. Curated supply + standard + taste + house app + add-ons —
WITHOUT owning the cleaning.

## What it is
- CURATE + DELIVER the supply boxes (the self-correcting inventory system already built)
- SET + CERTIFY the standard (seal, audit, consistency)
- The TASTE layer (scent, linens, copper key, design for Collector's)
- The HOUSE APP (guest experience)
- ADD-ONS (florals, tablescapes, laundry concierge)
- The OWNER'S CLEANER executes to the Vellum standard (Vellum certifies/trains/audits
  them — does NOT employ them)

## Why it's the BETTER business
1. Asset-light, infinitely scalable (Stitch Fix doesn't make clothes/employ tailors;
   Vellum doesn't employ cleaners/own laundry — curate + supply + certify). Path to 500
   without drowning in payroll/no-shows/liability. Cleaning was the anchor that would sink scale.
2. Extraordinary margins (90%+ subscription; strip cleaning payroll -> cleaner still).
   Software-like margins in a hospitality dress.
3. Category no one owns: full-service takes 20-40% and does everything; GPOs give access
   w/ no service; NOBODY does the curated+certified+tasteful supply/standard layer for the
   self-managing owner. Vellum CREATES + OWNS the category.
4. Most SLOAN-shaped: she's a curator (taste/standard/system/eye), not a cleaning-crew
   manager. Business matches the founder.
5. Sellable + inheritable: a standards/supply infrastructure biz w/ recurring revenue +
   taste moat + a category to itself = worth MULTIPLES of a regional cleaning company.
   Matters for "son inherits this" — an ASSET, not a payroll headache.

## The ONE caution (and it's already being solved)
Not owning cleaning = quality-control risk (owner's cleaner must execute to standard, or
the seal is on a sub-standard home). REQUIRES a strong certification + audit + accountability
+ revocation system to protect the seal. -> SLOAN IS BUILDING EXACTLY THAT NOW. The audit
form, checklists, "at standard?" checks, revocable certification = the mechanisms that let
Vellum certify WITHOUT cleaning and still protect the brand. The system being built IS what
makes the Stitch-Fix model possible.

## How she got here
Built her way to it — the operations revealed the SYSTEM is the product, not the labor.
Sequencing still stands (Section 34): maybe do cleaning for first few Mobile properties to
LEARN the standard/build the playbook, then shift to certifying owners' cleaners to SCALE.

---

# 36. INVESTOR-GRADE SHARPENING (from external premortem, 9/22)

An outside premortem (investor lens) CONFIRMED the architecture and handed us sharper
language. It called the model "a coherent operating system with the important parts
already designed" — validation, not correction. Absorb these before the partner pitch:

## Recast the economics (the one real fix before pitching)
- "90% gross" and "74-77% net" are HEADLINE margins, not CONTRIBUTION margin after
  fully-loaded costs (packing labor, freight, storage, shrinkage, payment fees, support
  time, founder time). A sharp partner WILL poke this.
- Reframe honestly: "high software-and-standards margins; physical supply costs passed
  through transparently and tracked SEPARATELY from recurring contribution margin;
  target contribution margin subject to validation." Lose nothing, gain credibility.
- Report CONTRIBUTION MARGIN PER PROPERTY (sub revenue minus support, fulfillment labor,
  payment fees, software, inspections, credits, allocated delivery) — the real engine.

## Qualify the "under 7%" claim (one-line fix)
- 7% is true at ~$60K revenue, but ~13% at $30K. Say: "For qualified properties producing
  ~$60K+ annual booking revenue, Vellum's core membership stays below ~7% of gross booking
  revenue, while preserving owner control." Makes qualification an ICP discipline.

## Reframe positioning language
- "everything a boutique hotel does" -> "the repeatable guest-ready standards that make a
  rental feel intentionally operated, not merely furnished."
- "category no one owns" -> "a fragmented category with no dominant, standards-led premium
  overlay brand for owner-controlled STRs." More defensible, avoids overclaiming.
- Vellum is a TECH-ENABLED quality-control + inventory + brand-standards company (not a
  pure asset-light software co). Still attractive; fund/value with operational reality.

## Capital principle: "FUND PROPERTIES, NOT HOPE"
- Every inventory dollar tied to an executed agreement + paid onboarding fee + defined
  property profile + replenishment policy. (= the atelier float discipline, stated well.)
- First capital buys EVIDENCE, DENSITY, working-capital resilience — NOT broad marketing
  or speculative warehouse. Use of funds: committed-property inventory float, pilot
  measurement, cleaner enablement, targeted (not broad) owner acquisition, risk/compliance,
  systems hardening.

## The moat (say this to a partner)
Products (sheets, coffee, candle, guide) are copyable. The moat = the CLOSED OPERATIONAL
LOOP: Standard -> cleaner scan -> par verification -> exception -> replenishment ->
documented compliance. Plus certification data, supplier economics, proof library, and a
revocable seal whose integrity is enforced. "No scan, no verified turnover. No verified
turnover, no active certification."

## VALIDATION PLAN = Phase 1 (this is the real next phase)
The system is proven as a BUILD; unproven as a PAID/RETAINED/MEASURED thing. Enroll 10-15
PAID founding properties (not free beta), signed baseline before onboarding, paid
onboarding fee, data/photo rights. Prove: conversion at price, repeatable onboarding time,
baseline audit before badge, reliable scans, retention, contribution margin after ALL
direct costs, 3+ documented owner outcomes (ADR/RevPAR lift, review lift, hours saved).

## SEQUENCING (don't over-build for launch)
Scale-stage governance (cleaner-network controls/insurance, market-entry gates, enterprise
tier, backup-cleaner bench, formal recert) = Phase 2-3, NOT launch. Note them, don't build
them now. Launching in Mobile with a few founding properties needs the offer + proof, not
the 500-property apparatus.

## PriceLabs ADR-lift reporting (build it — strongest proof)
Market-ADJUSTED lift (property vs. 5-15 comp set), a recorded Vellum ACTIVATION DATE, and
an INTERVENTION LOG (activation, redesign, new photos, listing copy, PriceLabs/price/min-stay
changes, events). Headline: not "ADR rose 18%" but "ADR +18% vs comp-set +8% -> +10pt
market-adjusted, RevPAR +9.8pt." Associative language, integrity intact. Monthly one-page
branded owner report in the portal (ADR/occ/RevPAR/revenue vs comp + Vellum ops: scan %,
par-met %, stockouts, supply cost/occupied night + review themes + 3 recommendations).

## Bottom line
The premortem did NOT undermine Vellum — it validated the architecture and handed the
investor-grade language to defend it. Sloan built the hard part. Next: prove it with paid
founding properties + recast the numbers honestly + qualify the claims. That's the work,
not a flaw.

---

# 37. SHRINK — where it actually is (9/23) + LOCKED CLOSET requirement

Sloan interrogated the "shrink" line. Correct breakdown:
- **Property closet shrink = $0 to Vellum.** Supplies delivered + invoiced = OWNER's
  inventory. Cleaner theft from a LOCKED closet = owner's loss, not Vellum's. Money's
  already made on the box. (Locked closet protects owner + relationship + seal, but the
  financial risk isn't Vellum's.)
- **Transit shrink ~$0** (local hand-delivery, no carrier). Higher only for distant
  carrier-shipped markets — another reason local is leaner.
- **Atelier (nook) shrink = the ONLY real one, and it's small (~$1.50/property/mo).**
  NOT theft (it's the nook). It's: breakage (candle/diffuser/coffee), spoilage
  (perishables — half-and-half, coffee staleness), miscount, unbillable use (staging/
  samples). Control: store dry/organized, FIFO perishables, accurate receiving counts
  (system already does). Corrected Signature CM ~80% (barely moved — Sloan was right the
  big risk isn't hers).

## 🔴 LOCKED SUPPLY CLOSET = a Vellum standard / onboarding / CONTRACT requirement
Owner must provide a lockable supply closet. Reasons: (1) shifts theft risk to owner
(protects Vellum margin), (2) protects supplies from guests, (3) hotel-standard operating
practice, (4) CONTRACT CLAUSE: "Owner provides a lockable supply storage area; supplies
delivered become Owner's property upon delivery; Vellum is not liable for on-site loss,
theft, or misuse." Add to onboarding checklist + the service agreement (Trey to finalize
wording).

---

# 38. BUILD LOG + CONTRACT STRUCTURE + onboarding tracker (9/23)

## Contract structure decision: ONE contract, tier as a variable
NOT three separate contracts, NOT a checkbox in the contract body. The terms are
IDENTICAL across Edit/Signature/Collector's (same certification, supplies-at-cost,
locked-closet, liability). Only PRICE + INCLUSIONS differ by tier — those live in the
ONBOARDING RECORD / tier schedule, not the contract body.
- Contract references "the selected tier at $[price]/mo, per the onboarding record."
- Tier captured on the FORM (plan_type), prefills into the signed record.
- Benefits: change a term once (not 3x), Trey reviews one doc, upgrades need no new
  contract, JotForm-friendly.
- Tier CHECKBOX belongs on the onboarding/proposal FORM, not in the contract text.

## Built today (deploy + review):
- **Onboarding Tracker** (admin-onboarding.html + get-onboarding.js + update-onboarding.js
  + admin.html nav). Pipeline: LEAD -> PROPOSAL_SENT -> FEE_PAID -> CONTRACT_SIGNED ->
  BASELINE_CAPTURED -> AUDIT_PASSED -> SUPPLIES_LOADED -> LIVE. Click stage to advance.
  Flags: fee paid / contract signed / LOCKED CLOSET confirmed. BASELINE CAPTURE built in
  (ADR/occupancy/review + date) with "capture before going live" warning = closes
  premortem gap #1. Added columns to property_onboarding_submissions: onboarding_stage,
  onboarding_fee_paid, contract_signed, baseline_adr/occupancy/review_score,
  baseline_captured_date, vellum_live_date, locked_closet_confirmed.
- **Service & Certification Agreement DRAFT PDF** (vellum-service-agreement-DRAFT.pdf).
  One clean concise doc, marked PENDING LEGAL REVIEW. Includes locked-closet/on-site-loss
  clause, at-cost definition, certification+revocation ("no scan/no verified turn/no
  active cert"), liability cap, AL governing law. -> REVIEW -> TREY (AdamsIP) -> then
  upload final to JotForm. Do NOT use draft as-is with a client.

## Still to build (sequenced):
- **PriceLabs owner-report PDF** — needs real BASELINE data to compute lift, so it comes
  AFTER baselines captured on founding properties. Columns exist: pricelabs_listing_id,
  pricelabs_report_url. Report = market-adjusted ADR/RevPAR lift vs comp set + activation
  date + intervention log + Vellum ops metrics (per premortem section 36).

## 🔴 LATER (when the system is complete): FLOW DIAGRAM
Build a full flow diagram of EVERYTHING — the whole Vellum system end to end:
onboarding -> contract/fee -> baseline -> audit -> supplies loaded -> live; the inventory
loop (set-out decrement -> audit overwrite -> ordering board -> pack -> warehouse decrement
-> receive -> par alert); the two-tier warehouse; owner portal; add-ons/Flourish; the
money flow (Stripe -> QuickBooks); and the certification/seal lifecycle. Visual map of the
whole nervous system. Do at the end when all pieces are wired.

---

# 39. FULL PREMORTEM DOC SAVED (9/25, parked for Monday)

The complete premortem analysis (Perplexity conversation — investor premortem, tier
validation, "will owners buy it," PriceLabs ADR-reporting rounds) saved to outputs as
**vellum-premortem-full.md**. Reference copy.

NOTE: the ACTIONABLE takeaways are already distilled in Section 36 (investor sharpening)
+ built into today's work (baseline capture + locked closet in the onboarding tracker &
contract). Nothing new to absorb — the full doc is the deep reference; the SOP has the
action items. Not able to task until Monday (uploaded Friday) — parked, no urgency.

---

# 40. ⭐ ADR/RevPAR PROOF METHOD (the seasonality section — 9/25)

The premortem's best section: HOW to prove Vellum lift credibly (not hand-wavy). This is
the ROI-proof method that makes Vellum defensible to owners AND investors.

## The core problem it solves
"ADR went up 22% after Vellum" is WEAK — because the property might have just hit a
naturally busier season. Seasonality can fake a lift. You must SEPARATE Vellum's effect
from the market's normal movement.

## The method: DIFFERENCE-IN-DIFFERENCES (compare against a matched comp set)
Compare the PROPERTY's change to a COMPARABLE-SET's change over the SAME dates:
  Vellum lift = (property post - property pre) - (comp-set post - comp-set pre)
If the property rose 22% while similar properties rose 8%, the ~14-point gap is the
"market-adjusted lift" — that's the part plausibly attributable to Vellum.

## RevPAR is the PRIMARY metric, NOT ADR alone
- ADR alone LIES: a higher nightly rate is not a win if occupancy drops (empty nights).
- RevPAR = ADR x Occupancy = captures BOTH rate and demand. Use it as the headline.
- Report ADR, occupancy, RevPAR, revenue, booked nights, booking pace, reviews TOGETHER.

## Build a TRUE comp set (5-15 properties)
Match on: same neighborhood/narrow radius, property type (condo/house), beds/baths,
sleeps, demand drivers (waterfront/view/pool/parking), similar finish level BEFORE
redesign, similar fees/min-stay. EXCLUDE: newly-listed, units renovated during the test,
abnormal pricing, owner-blocked units, luxury homes outside the class. A generic "Mobile
average" is too loose.

## Three benchmarks (use all three = most defensible)
1. Same property pre-vs-post (controls for location/physical traits)
2. Matched comp set same dates (controls for SEASONALITY + local demand + events)
3. Same property year-over-year (controls for annual seasonality)

## Data windows
90-180 days pre AND post; same months prior year; >=30 booked nights in both periods
before a confident ADR claim. Longer = better (a 30-day window gets distorted by one
holiday/event/group booking). PriceLabs recommends 12-36 months to establish seasonal
patterns; supports 7/30/60/90-day pacing + year-over-year.

## The honest claim language (integrity)
SAY: "Post-activation, the property's ADR rose 20.1% vs its matched comp set's 7.5% over
the same dates -> +12.6pt market-adjusted ADR outperformance; RevPAR +15.5pt."
DON'T SAY: "Vellum CAUSED a 20.1% ADR increase." (Can't prove causation with one
property; show OUTPERFORMANCE ASSOCIATED with the intervention.)

## Clean activation date + intervention log (critical)
Record: baseline-photo date, install date, photography date, listing-refresh date, any
pricing-rule change, Vellum live date, major disruptions (owner blocks/storms/events).
Because design+photos+copy+pricing often go live together, claim the "Vellum SIGNATURE
PACKAGE effect," not "interior-design lift." Photos/copy/pricing recs are PART of the
product, not contamination — just label it as the package effect.

## Don't change pricing blindly during the test
Keep non-design variables stable initially (base price, min-stays, fees, cancellation,
no new amenity, no PMS switch) OR log every change. Owner-blocked weekends distort occ.

## Booking curves = EARLY evidence (ADR/revenue are LAGGING)
Stays booked months before the redesign make ADR/revenue slow to show the effect. First
signal = forward BOOKING PACE. Track vs comp set at 7/30/60/90-day horizons: booking
sooner? higher booked ADR? holding rate longer (not discounting late)? Early honest
statement: "Within 45 days of relaunch, 60-day forward pace was 18% ahead of comp set,
booked ADR 9% higher; realized revenue assessed after stay dates mature."

## For Vellum STANDARD (not Signature): proof shows as OPERATIONAL wins first
Fewer failures before ADR shifts: scan compliance rate, verified-par completion,
stockout incidents (down), reduced owner hours, review-language improvements.

## IMPLICATION FOR THE BUILD (Monday+)
The PriceLabs owner-report should implement DIFFERENCE-IN-DIFFERENCES: property vs.
matched comp set, RevPAR-primary, 3 benchmarks, intervention log, package-effect
language, booking-pace early signal. The baseline capture (built 9/23 in onboarding
tracker) is step one. Need: a comp-set definition per property + pull comp data from
PriceLabs. This is the "Vellum Effect" proof engine.
