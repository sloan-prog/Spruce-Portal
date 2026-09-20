import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Returns properties that need a box (any DRIVER item at/below min_threshold),
// each with a full top-off list (every item below par -> qty to bring to par).
export default async function handler(req, res) {
  try {
    // catalog: item names + reorder priority
    const { data: catalog } = await supabase
      .from('item_catalog')
      .select('item_code, item_name, reorder_priority, reorder_point_cleans');
    const cat = {};
    (catalog || []).forEach(c => { cat[c.item_code] = c; });

    // all property stock
    const { data: stock } = await supabase
      .from('property_stock')
      .select('property_id, item_code, current_on_hand, target_par, min_threshold');

    // property names
    const { data: props } = await supabase
      .from('properties')
      .select('property_id, property_name, plan_type');
    const propName = {};
    (props || []).forEach(p => { propName[p.property_id] = p.property_name; });

    // group stock by property
    const byProp = {};
    (stock || []).forEach(s => {
      if (!byProp[s.property_id]) byProp[s.property_id] = [];
      byProp[s.property_id].push(s);
    });

    const needsBox = [];
    Object.keys(byProp).forEach(pid => {
      const rows = byProp[pid];
      // is any DRIVER at/below its min_threshold?
      const triggered = rows.some(r => {
        const c = cat[r.item_code];
        return c && c.reorder_priority === 'DRIVER' &&
               r.current_on_hand !== null && r.min_threshold !== null &&
               Number(r.current_on_hand) <= Number(r.min_threshold);
      });
      if (!triggered) return;

      // build top-off list: every item below par gets topped up
      const topoff = [];
      rows.forEach(r => {
        const c = cat[r.item_code] || {};
        const par = Number(r.target_par || 0);
        const onHand = Number(r.current_on_hand || 0);
        const need = par - onHand;
        if (need > 0) {
          topoff.push({
            item_code: r.item_code,
            item_name: c.item_name || r.item_code,
            priority: c.reorder_priority || '',
            on_hand: onHand,
            par: par,
            min: r.min_threshold,
            topoff_qty: need,
            is_driver_low: c.reorder_priority === 'DRIVER' &&
                           r.min_threshold !== null && onHand <= Number(r.min_threshold)
          });
        }
      });
      // sort: drivers-that-are-low first, then other drivers, then rest
      topoff.sort((a,b) => {
        if (a.is_driver_low !== b.is_driver_low) return a.is_driver_low ? -1 : 1;
        const order = { DRIVER:0, RIDE_ALONG:1, SLOW:2 };
        return (order[a.priority]??3) - (order[b.priority]??3);
      });

      needsBox.push({
        property_id: pid,
        property_name: propName[pid] || pid,
        item_count: topoff.length,
        driver_low_count: topoff.filter(t => t.is_driver_low).length,
        topoff
      });
    });

    // sort properties: most driver-low items first (most urgent)
    needsBox.sort((a,b) => b.driver_low_count - a.driver_low_count);

    res.status(200).json({ success: true, needsBox, count: needsBox.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
