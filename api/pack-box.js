import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Confirm-Packed: for a property box, decrement warehouse_stock (WAREHOUSE_PICK) and
// increment property_stock as EXPECTED/in-transit (audit corrects at next turn).
// Body: { property_id, items: [{item_code, qty}], note }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const propertyId = body.property_id;
    const items = body.items || [];
    if (!propertyId) return res.status(400).json({ success: false, error: 'Missing property_id' });
    if (!items.length) return res.status(400).json({ success: false, error: 'No items to pack' });

    const results = [];
    for (const it of items) {
      const qty = Number(it.qty || 0);
      if (qty <= 0) continue;

      // --- decrement WAREHOUSE ---
      const { data: wh } = await supabase
        .from('warehouse_stock').select('units_on_hand').eq('item_code', it.item_code).maybeSingle();
      const whBefore = Number(wh?.units_on_hand ?? 0);
      const whAfter = whBefore - qty; // may go negative if oversold — flagged in UI
      await supabase.from('warehouse_stock')
        .update({ units_on_hand: whAfter, last_order_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() })
        .eq('item_code', it.item_code);
      await supabase.from('stock_adjustments').insert({
        property_id: propertyId, item_code: it.item_code, location_type: 'WAREHOUSE',
        qty_change: -qty, qty_before: whBefore, qty_after: whAfter,
        reason_code: 'WAREHOUSE_PICK', note: body.note || ('Packed box for ' + propertyId), created_by: 'admin'
      });

      // --- increment PROPERTY (expected / in-transit) ---
      const { data: ps } = await supabase
        .from('property_stock').select('current_on_hand')
        .eq('property_id', propertyId).eq('item_code', it.item_code).maybeSingle();
      if (ps) {
        const pBefore = Number(ps.current_on_hand ?? 0);
        const pAfter = pBefore + qty;
        await supabase.from('property_stock')
          .update({ current_on_hand: pAfter })
          .eq('property_id', propertyId).eq('item_code', it.item_code);
        await supabase.from('stock_adjustments').insert({
          property_id: propertyId, item_code: it.item_code, location_type: 'PROPERTY',
          qty_change: qty, qty_before: pBefore, qty_after: pAfter,
          reason_code: 'BOX_EXPECTED', note: 'In-transit box (audit will confirm)', created_by: 'admin'
        });
      }

      results.push({ item_code: it.item_code, warehouse_after: whAfter, warehouse_negative: whAfter < 0 });
    }

    res.status(200).json({ success: true, packed: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
