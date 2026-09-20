import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Confirm-Received: increments warehouse_stock for each received item + logs
// a RESTOCK_DELIVERY stock_adjustment. Body: { items: [{item_code, qty}], note }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const items = body.items || [];
    if (!items.length) return res.status(400).json({ success: false, error: 'No items to receive' });

    const results = [];
    for (const it of items) {
      const qty = Number(it.qty || 0);
      if (qty <= 0) continue;

      // read current
      const { data: cur } = await supabase
        .from('warehouse_stock')
        .select('units_on_hand')
        .eq('item_code', it.item_code)
        .maybeSingle();
      const before = Number(cur?.units_on_hand ?? 0);
      const after = before + qty;

      // update warehouse
      await supabase
        .from('warehouse_stock')
        .update({ units_on_hand: after, last_received_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() })
        .eq('item_code', it.item_code);

      // audit trail
      await supabase.from('stock_adjustments').insert({
        item_code: it.item_code,
        location_type: 'WAREHOUSE',
        qty_change: qty,
        qty_before: before,
        qty_after: after,
        reason_code: 'RESTOCK_DELIVERY',
        note: body.note || 'Received from supplier',
        created_by: 'admin'
      });

      results.push({ item_code: it.item_code, before, after });
    }

    res.status(200).json({ success: true, received: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
