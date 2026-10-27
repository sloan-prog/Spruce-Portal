import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ITEM = 'CON-017';

// --- period helpers (UTC) ---
function prevMonthKey() {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7); // 'YYYY-MM'
}
function monthRange(period) {
  const [y, m] = period.split('-').map(Number);
  return [new Date(Date.UTC(y, m - 1, 1)).toISOString(), new Date(Date.UTC(y, m, 1)).toISOString()];
}

// Create a Stripe invoice item via REST (no SDK dependency). Folds onto the
// customer's next invoice automatically (their monthly subscription invoice).
async function stripeInvoiceItem({ secret, customer, amount, currency, description, idemKey }) {
  const body = new URLSearchParams({ customer, amount: String(amount), currency, description });
  const r = await fetch('https://api.stripe.com/v1/invoiceitems', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + secret,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idemKey
    },
    body
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || ('Stripe ' + r.status));
  return data; // includes id
}

/**
 * Bill-on-use coffee billing. Monthly.
 *   - Sums CLEAN_DECREMENT (actual bags used) of CON-017 per property for the period.
 *   - Rolls up per owner, prices at item_catalog CON-017 cost_per_unit (at-cost pass-through).
 *   - Adds one Stripe invoice item per owner, which Stripe folds onto their next
 *     subscription invoice (one monthly bill). Spoilage/pulls never bill (different reason code).
 *   - Idempotent per (owner, period) via the coffee_billing ledger + Stripe Idempotency-Key.
 *
 * Safe to deploy before Stripe is wired: with no STRIPE_SECRET_KEY it runs in PREVIEW
 * (computes + records what WOULD bill, calls nothing).
 *
 * Auth: Bearer $CRON_SECRET. Query: ?period=YYYY-MM (default: last month), ?dry=1 (force preview).
 */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.authorization || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const period = (req.query.period || prevMonthKey()).toString();
  const dry = req.query.dry === '1' || !process.env.STRIPE_SECRET_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const [start, end] = monthRange(period);
  const out = { period, dry, billed: [], skipped: [], errors: [], total_cents: 0 };

  try {
    // unit price (at-cost)
    const { data: ic } = await supabase.from('item_catalog').select('cost_per_unit').eq('item_code', ITEM).maybeSingle();
    const unitCents = Math.round(Number(ic?.cost_per_unit ?? 10) * 100);

    // usage this period: CLEAN_DECREMENT of CON-017 per property
    const { data: adj, error } = await supabase
      .from('stock_adjustments')
      .select('property_id, qty_change')
      .eq('item_code', ITEM).eq('reason_code', 'CLEAN_DECREMENT').eq('location_type', 'PROPERTY')
      .gte('created_at', start).lt('created_at', end);
    if (error) throw error;

    const bagsByProp = {};
    (adj || []).forEach(a => {
      const used = Math.max(0, -Number(a.qty_change || 0));
      if (!a.property_id || used === 0) return;
      bagsByProp[a.property_id] = (bagsByProp[a.property_id] || 0) + used;
    });

    // map property -> owner
    const propIds = Object.keys(bagsByProp);
    if (!propIds.length) { return res.status(200).json({ ok: true, ...out, note: 'no coffee usage in period' }); }
    const { data: props } = await supabase.from('properties').select('property_id, property_name, owner_id').in('property_id', propIds);
    const ownerByProp = {}; (props || []).forEach(p => { ownerByProp[p.property_id] = { owner_id: p.owner_id, name: p.property_name }; });

    // roll up per owner
    const byOwner = {};
    propIds.forEach(pid => {
      const o = ownerByProp[pid]; if (!o || !o.owner_id) return;
      if (!byOwner[o.owner_id]) byOwner[o.owner_id] = { bags: 0, detail: [] };
      byOwner[o.owner_id].bags += bagsByProp[pid];
      byOwner[o.owner_id].detail.push({ property_id: pid, property_name: o.name, bags: bagsByProp[pid] });
    });

    // owners already billed this period (idempotency)
    const { data: done } = await supabase.from('coffee_billing').select('owner_id').eq('period', period);
    const already = new Set((done || []).map(d => d.owner_id));

    const ownerIds = Object.keys(byOwner);
    const { data: owners } = await supabase.from('owners').select('owner_id, owner_name, stripe_customer_id').in('owner_id', ownerIds);
    const ownerRec = {}; (owners || []).forEach(o => { ownerRec[o.owner_id] = o; });

    for (const oid of ownerIds) {
      try {
        if (already.has(oid)) { out.skipped.push({ owner_id: oid, reason: 'already billed for ' + period }); continue; }
        const { bags, detail } = byOwner[oid];
        const amount = bags * unitCents;
        const rec = ownerRec[oid] || {};
        const label = 'Coffee — ' + bags + ' bag' + (bags === 1 ? '' : 's') + ' used, ' + period;

        let status = 'PREVIEW', stripeId = null;
        if (!dry && rec.stripe_customer_id) {
          const item = await stripeInvoiceItem({
            secret: stripeKey, customer: rec.stripe_customer_id, amount, currency: 'usd',
            description: label, idemKey: 'coffee-' + oid + '-' + period
          });
          stripeId = item.id; status = 'BILLED';
        } else if (!dry && !rec.stripe_customer_id) {
          status = 'NO_CUSTOMER';
        }

        await supabase.from('coffee_billing').insert({
          owner_id: oid, period, bags, unit_cents: unitCents, amount_cents: amount,
          stripe_invoice_item_id: stripeId, status, detail
        });

        out.total_cents += amount;
        (status === 'BILLED' ? out.billed : out.skipped).push({ owner_id: oid, owner: rec.owner_name, bags, amount_cents: amount, status, stripe_invoice_item_id: stripeId });
      } catch (e) {
        out.errors.push({ owner_id: oid, error: e.message });
      }
    }

    console.log('CRON coffee-bill', JSON.stringify(out));
    return res.status(out.errors.length ? 207 : 200).json({ ok: out.errors.length === 0, ...out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
