import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ITEM = 'CON-017';

// date-only helpers in UTC
function today() { return new Date().toISOString().split('T')[0]; }
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0]; }
function mondayOnOrBefore(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const back = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().split('T')[0];
}

/**
 * Daily coffee engine. For every coffee property with a live lot:
 *   - PULL: at/after expiry (roast + freshness) with bags still on hand -> flag the lot for pull.
 *   - REORDER: on the Monday one week before expiry (≈ week-5 Monday, aligns with Soul Caffeine's
 *     order-Monday-of-prior-week cutoff) -> drop a coffee line onto the low-stock worksheet.
 * Swap-driven pulls (old lot still there when a new one arrives) are handled at receive time.
 *
 * Auth: Bearer $CRON_SECRET (same pattern as /api/process-intake). Schedule daily in vercel.json.
 */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.authorization || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const T = today();
  const out = { ran_at: new Date().toISOString(), reorders: [], pulls: [], checked: 0, errors: [] };

  try {
    const { data: props, error } = await supabase
      .from('properties')
      .select('property_id, property_name, plan_type, coffee_active_lot, coffee_status, par_level')
      .eq('coffee_enabled', true).eq('active', true)
      .not('coffee_active_lot', 'is', null);
    if (error) throw error;

    // unit cost (CON-017) for spoilage valuation
    let unitCost = 10;
    { const { data: ic } = await supabase.from('item_catalog').select('cost_per_unit').eq('item_code', 'CON-017').maybeSingle(); if (ic && ic.cost_per_unit != null) unitCost = Number(ic.cost_per_unit); }

    for (const p of (props || [])) {
      try {
        out.checked++;
        const { data: lot } = await supabase.from('coffee_lots').select('*')
          .eq('property_id', p.property_id).eq('lot_code', p.coffee_active_lot).maybeSingle();
        if (!lot || lot.status === 'PULLED' || lot.status === 'FINISHED') continue;

        const expires = lot.expires_on;                 // date string
        const { data: stock } = await supabase.from('property_stock')
          .select('current_on_hand, target_par').eq('property_id', p.property_id).eq('item_code', ITEM).maybeSingle();
        const onHand = Number(stock?.current_on_hand ?? 0);

        // ---- PULL ----
        if (T >= expires && lot.status === 'ACTIVE' && onHand > 0 && !lot.pull_signaled) {
          const spoil = Math.round(onHand * unitCost * 100) / 100;
          await supabase.from('coffee_lots').update({ status: 'PULL_REQUESTED', pull_signaled: true,
            pulled_bags: onHand, spoilage_value: spoil, spoiled_at: new Date().toISOString(),
            updated_at: new Date().toISOString() }).eq('id', lot.id);
          await supabase.from('properties').update({ coffee_status: 'PULL_DUE' }).eq('property_id', p.property_id);
          out.pulls.push({ property_id: p.property_id, lot: lot.lot_code, roast: lot.roast_date, expired_on: expires, bags_on_hand: onHand, spoilage_value: spoil });
        }

        // ---- REORDER (order-by Monday, one week before expiry) ----
        const reorderMonday = mondayOnOrBefore(addDays(expires, -7));
        if (T >= reorderMonday && !lot.reorder_signaled) {
          const suggested = Number(lot.bags_received || stock?.target_par || p.par_level || 2);
          await supabase.from('low_stock_alerts').insert({
            alert_id: 'COFFEE-' + p.property_id + '-' + lot.lot_code,
            property_id: p.property_id, property_name: p.property_name,
            plan_type: p.plan_type, item_code: ITEM,
            item_name: 'Coffee Bags — roast-driven reorder (lot ' + lot.lot_code + ', expires ' + expires + ')',
            on_hand: onHand, threshold: 0, suggested_qty: suggested, resolved: false
          });
          await supabase.from('coffee_lots').update({ reorder_signaled: true, updated_at: new Date().toISOString() }).eq('id', lot.id);
          const { data: pp } = await supabase.from('properties').select('coffee_status').eq('property_id', p.property_id).maybeSingle();
          if (pp && pp.coffee_status !== 'PULL_DUE') {
            await supabase.from('properties').update({ coffee_status: 'REORDER_DUE' }).eq('property_id', p.property_id);
          }
          out.reorders.push({ property_id: p.property_id, lot: lot.lot_code, order_by: reorderMonday, expires, suggested_qty: suggested });
        }

        // ---- natural depletion: out of bags, still fresh -> finished ----
        if (onHand === 0 && lot.status === 'ACTIVE' && T < expires) {
          await supabase.from('coffee_lots').update({ status: 'FINISHED', updated_at: new Date().toISOString() }).eq('id', lot.id);
        }
      } catch (e) {
        out.errors.push({ property_id: p.property_id, error: e.message });
      }
    }

    console.log('CRON coffee', JSON.stringify(out));
    return res.status(out.errors.length ? 207 : 200).json({ ok: out.errors.length === 0, ...out });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
