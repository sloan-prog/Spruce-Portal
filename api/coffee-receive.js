import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ITEM = 'CON-017'; // Coffee Bags

// --- helpers -------------------------------------------------------------
function yymmdd(dateStr) {
  // dateStr: 'YYYY-MM-DD' -> 'YYMMDD'
  const [y, m, d] = dateStr.split('-');
  return y.slice(2) + m + d;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

/**
 * Receive a coffee delivery for ONE property.
 * Mints the lot code (HOTP + roast YYMMDD), creates the coffee_lots row,
 * adds the bags to the property's closet stock (CON-017) with a RESTOCK_DELIVERY
 * ledger entry, flags any prior active lot for pull (swap), and sets the property's
 * active-lot / freshness fields. Returns the lot so the page can print labels.
 *
 * Body JSON: { property_id, roast_date 'YYYY-MM-DD', bags, received_date?, received_by?, freshness_days?, note? }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const property_id = String(body.property_id || '').trim();
    const roast_date  = String(body.roast_date || '').trim();      // YYYY-MM-DD
    const bags        = Number(body.bags || 0);
    const received_date = String(body.received_date || new Date().toISOString().split('T')[0]);
    const received_by = String(body.received_by || 'admin');
    const note        = body.note ? String(body.note) : null;

    if (!property_id) return res.status(400).json({ success: false, error: 'property_id required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(roast_date)) return res.status(400).json({ success: false, error: 'roast_date must be YYYY-MM-DD' });
    if (!(bags > 0)) return res.status(400).json({ success: false, error: 'bags must be > 0' });

    // property + its freshness window
    const { data: prop, error: pErr } = await supabase
      .from('properties')
      .select('property_id, property_name, plan_type, coffee_freshness_days, coffee_active_lot')
      .eq('property_id', property_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!prop) return res.status(404).json({ success: false, error: 'property not found' });

    const freshness_days = Number(body.freshness_days || prop.coffee_freshness_days || 42);
    const expires_on = addDays(roast_date, freshness_days);

    // mint a unique lot code for this property (HOTP + roast YYMMDD, +letter on collision)
    const base = 'HOTP' + yymmdd(roast_date);
    let lot_code = base;
    {
      const { data: existing } = await supabase
        .from('coffee_lots')
        .select('lot_code')
        .eq('property_id', property_id)
        .ilike('lot_code', base + '%');
      const taken = new Set((existing || []).map(r => r.lot_code));
      if (taken.has(lot_code)) {
        for (const c of 'BCDEFGHIJKLMNOPQRSTUVWXYZ') {
          if (!taken.has(base + c)) { lot_code = base + c; break; }
        }
      }
    }

    // --- flag the prior active lot for pull if the closet still holds bags (swap) ---
    let priorPull = null;
    if (prop.coffee_active_lot && prop.coffee_active_lot !== lot_code) {
      const { data: beforeStock } = await supabase
        .from('property_stock')
        .select('current_on_hand')
        .eq('property_id', property_id).eq('item_code', ITEM)
        .maybeSingle();
      const onHandBefore = Number(beforeStock?.current_on_hand ?? 0);
      if (onHandBefore > 0) {
        let unitCost = 10;
        const { data: ic } = await supabase.from('item_catalog').select('cost_per_unit').eq('item_code', ITEM).maybeSingle();
        if (ic && ic.cost_per_unit != null) unitCost = Number(ic.cost_per_unit);
        const spoil = Math.round(onHandBefore * unitCost * 100) / 100;
        await supabase.from('coffee_lots')
          .update({ status: 'PULL_REQUESTED', pull_signaled: true, updated_at: new Date().toISOString(),
                    pulled_bags: onHandBefore, spoilage_value: spoil, spoiled_at: new Date().toISOString(),
                    note: 'Superseded by ' + lot_code + ' — pull remaining bags' })
          .eq('property_id', property_id).eq('lot_code', prop.coffee_active_lot)
          .eq('status', 'ACTIVE');
        priorPull = { lot_code: prop.coffee_active_lot, bags_on_hand: onHandBefore, spoilage_value: spoil };
      } else {
        // old lot fully used — mark it finished
        await supabase.from('coffee_lots')
          .update({ status: 'FINISHED', updated_at: new Date().toISOString() })
          .eq('property_id', property_id).eq('lot_code', prop.coffee_active_lot)
          .eq('status', 'ACTIVE');
      }
    }

    // --- create the new lot ---
    const { data: lotRow, error: lErr } = await supabase
      .from('coffee_lots')
      .insert({
        lot_code, property_id, property_name: prop.property_name, item_code: ITEM,
        roast_date, received_date, freshness_days, bags_received: bags,
        status: 'ACTIVE', received_by, note
      })
      .select()
      .single();
    if (lErr) throw lErr;

    // --- add bags to the property closet (CON-017) + ledger ---
    const { data: cur } = await supabase
      .from('property_stock')
      .select('current_on_hand, target_par, min_threshold')
      .eq('property_id', property_id).eq('item_code', ITEM)
      .maybeSingle();
    const before = Number(cur?.current_on_hand ?? 0);
    const after  = before + bags;
    await supabase.from('property_stock').upsert({
      property_id, item_code: ITEM, current_on_hand: after,
      target_par: cur?.target_par ?? bags, min_threshold: cur?.min_threshold ?? 1,
      last_updated: new Date().toISOString()
    }, { onConflict: 'property_id,item_code' });

    await supabase.from('stock_adjustments').insert({
      property_id, item_code: ITEM, location_type: 'PROPERTY',
      qty_change: bags, qty_before: before, qty_after: after,
      reason_code: 'RESTOCK_DELIVERY',
      reference_id: lot_code, reference_table: 'coffee_lots',
      note: 'Coffee received — lot ' + lot_code + ' (roasted ' + roast_date + ')',
      created_by: received_by
    });

    // --- set the property's active lot + freshness state ---
    await supabase.from('properties').update({
      coffee_active_lot: lot_code,
      coffee_active_roast: roast_date,
      coffee_expires_on: expires_on,
      coffee_status: 'OK',
      coffee_last_received: received_date,
      updated_at: new Date().toISOString()
    }).eq('property_id', property_id);

    return res.status(200).json({
      success: true,
      lot: {
        lot_code, property_id, property_name: prop.property_name,
        roast_date, received_date, freshness_days, expires_on, bags,
        on_hand_after: after
      },
      prior_pull: priorPull
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
