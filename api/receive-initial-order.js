import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Two actions:
//  action 'receive_item' { id, received }  -> check/uncheck one item received
//  action 'place'        { property_id, track } -> mark track PLACED
//  action 'all_received' { property_id, track } -> ONLY if every item received:
//        seed property_stock to par for that track's items (one-time), lock the track.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const action = body.action;

    if (action === 'receive_item') {
      const { id, received } = body;
      await supabase.from('initial_orders')
        .update({ received: !!received, received_at: received ? new Date().toISOString() : null })
        .eq('id', id);
      return res.status(200).json({ success: true });
    }

    if (action === 'place') {
      const { property_id, track } = body;
      await supabase.from('initial_order_status')
        .update({ status: 'PLACED', placed_at: new Date().toISOString() })
        .eq('property_id', property_id).eq('track', track);
      return res.status(200).json({ success: true });
    }

    if (action === 'all_received') {
      const { property_id, track } = body;

      // Guard 1: already stocked? refuse (no re-do - would corrupt)
      const { data: st } = await supabase.from('initial_order_status')
        .select('stocked').eq('property_id', property_id).eq('track', track).maybeSingle();
      if (st && st.stocked) {
        return res.status(400).json({ success: false, error: 'Track already stocked - cannot re-run (would corrupt levels).' });
      }

      // Guard 2: every item must be received first
      const { data: items } = await supabase.from('initial_orders')
        .select('item_code, qty, received').eq('property_id', property_id).eq('track', track);
      if (!items || !items.length) {
        return res.status(400).json({ success: false, error: 'No items in this track.' });
      }
      const unreceived = items.filter(i => !i.received);
      if (unreceived.length) {
        return res.status(400).json({ success: false, error: unreceived.length + ' item(s) not yet received. Par-up blocked until all received.' });
      }

      // Seed property_stock = par for each item (the one-time initial stocking)
      for (const it of items) {
        const par = Number(it.qty);
        const { data: existing } = await supabase.from('property_stock')
          .select('id').eq('property_id', property_id).eq('item_code', it.item_code).maybeSingle();
        if (existing) {
          await supabase.from('property_stock')
            .update({ target_par: par, current_on_hand: par, min_threshold: Math.ceil(par * 0.3), last_updated: new Date().toISOString() })
            .eq('property_id', property_id).eq('item_code', it.item_code);
        } else {
          await supabase.from('property_stock')
            .insert({ property_id, item_code: it.item_code, target_par: par, current_on_hand: par, min_threshold: Math.ceil(par * 0.3), last_updated: new Date().toISOString() });
        }
        // audit trail
        await supabase.from('stock_adjustments').insert({
          property_id, item_code: it.item_code, location_type: 'PROPERTY',
          qty_change: par, qty_before: 0, qty_after: par,
          reason_code: 'INITIAL_STOCK', note: 'Initial order received + stocked (' + track + ')', created_by: 'admin'
        });
      }

      // Lock the track (stocked) - one-time
      await supabase.from('initial_order_status')
        .update({ status: 'RECEIVED', stocked: true, stocked_at: new Date().toISOString() })
        .eq('property_id', property_id).eq('track', track);

      return res.status(200).json({ success: true, stocked_items: items.length });
    }

    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
