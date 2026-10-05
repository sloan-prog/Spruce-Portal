import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Returns initial-order status for one property (if ?property_id=) or all in-progress.
export default async function handler(req, res) {
  try {
    const property_id = req.query.property_id;

    let statusQ = supabase.from('initial_order_status').select('*');
    if (property_id) statusQ = statusQ.eq('property_id', property_id);
    const { data: statuses } = await statusQ;

    let itemsQ = supabase.from('initial_orders').select('*');
    if (property_id) itemsQ = itemsQ.eq('property_id', property_id);
    const { data: items } = await itemsQ;

    // property names
    const { data: props } = await supabase.from('properties').select('property_id, property_name, plan_type');
    const pName = {}; (props || []).forEach(p => pName[p.property_id] = p.property_name);
    const pTier = {}; (props || []).forEach(p => pTier[p.property_id] = p.plan_type);

    // group items by property+track
    const byKey = {};
    (items || []).forEach(i => {
      const k = i.property_id + '|' + i.track;
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(i);
    });

    const tracks = (statuses || []).map(s => {
      const its = byKey[s.property_id + '|' + s.track] || [];
      const received = its.filter(i => i.received).length;
      return {
        property_id: s.property_id,
        property_name: pName[s.property_id] || s.property_id,
        plan_type: pTier[s.property_id] || '',
        track: s.track,
        status: s.status,
        stocked: s.stocked,
        item_count: its.length,
        received_count: received,
        all_received: its.length > 0 && received === its.length,
        items: its.sort((a,b) => (a.item_name||'').localeCompare(b.item_name||''))
      };
    });

    res.status(200).json({ success: true, tracks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
