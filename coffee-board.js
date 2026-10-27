import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Coffee board data for the admin COFFEE page and the dashboard card.
 *   GET /api/coffee-board                 -> { summary, properties, pulls, reorders }
 *   GET /api/coffee-board?property_id=XXX -> adds { lots } = full lot history for that property
 */
export default async function handler(req, res) {
  try {
    const property_id = (req.query.property_id || '').toString().trim();

    const { data: properties, error } = await supabase
      .from('v_coffee_status')
      .select('*')
      .order('days_to_expiry', { ascending: true, nullsFirst: false });
    if (error) throw error;

    const { data: pulls } = await supabase
      .from('coffee_lots')
      .select('lot_code, property_id, property_name, roast_date, expires_on, status, bags_received, note')
      .eq('status', 'PULL_REQUESTED')
      .order('expires_on', { ascending: true });

    const { data: reorders } = await supabase
      .from('low_stock_alerts')
      .select('alert_id, property_id, property_name, item_name, suggested_qty, created_at')
      .eq('item_code', 'CON-017').eq('resolved', false)
      .order('created_at', { ascending: false });

    // spoilage absorbed (last 90 days)
    const since90 = new Date(Date.now() - 90 * 864e5).toISOString();
    const { data: spoil } = await supabase.from('coffee_lots')
      .select('spoilage_value, pulled_bags').gte('spoiled_at', since90);
    const waste_value = (spoil || []).reduce((s, r) => s + Number(r.spoilage_value || 0), 0);
    const waste_bags  = (spoil || []).reduce((s, r) => s + Number(r.pulled_bags || 0), 0);

    // billable usage month-to-date (CLEAN_DECREMENT of CON-017)
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const { data: used } = await supabase.from('stock_adjustments')
      .select('qty_change').eq('item_code', 'CON-017').eq('reason_code', 'CLEAN_DECREMENT').eq('location_type', 'PROPERTY')
      .gte('created_at', monthStart);
    const billable_bags_mtd = (used || []).reduce((s, r) => s + Math.max(0, -Number(r.qty_change || 0)), 0);

    const summary = {
      total: (properties || []).length,
      ok: (properties || []).filter(p => p.coffee_status === 'OK').length,
      reorder_due: (properties || []).filter(p => p.coffee_status === 'REORDER_DUE').length,
      pull_due: (properties || []).filter(p => p.coffee_status === 'PULL_DUE').length,
      awaiting: (properties || []).filter(p => p.coffee_status === 'AWAITING_FIRST').length,
      expiring_soon: (properties || []).filter(p => p.days_to_expiry != null && p.days_to_expiry <= 10 && p.days_to_expiry >= 0).length,
      waste_value_90d: Math.round(waste_value * 100) / 100,
      waste_bags_90d: waste_bags,
      billable_bags_mtd,
    };

    const resp = { summary, properties: properties || [], pulls: pulls || [], reorders: reorders || [] };

    if (property_id) {
      const { data: lots } = await supabase
        .from('coffee_lots').select('*')
        .eq('property_id', property_id)
        .order('received_date', { ascending: false });
      resp.lots = lots || [];
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(resp);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
