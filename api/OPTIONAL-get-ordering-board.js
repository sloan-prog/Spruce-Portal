import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Returns properties that need a box (any DRIVER item at/below min_threshold),
// each with a full top-off list (every item below par -> qty to bring to par).
//
// COFFEE PATCH: a property is ALSO pulled onto the board when its coffee is
// roast-driven REORDER_DUE (the cron sets properties.coffee_status), even if the
// bag COUNT isn't low yet — so the freshness reorder rides the same Monday worksheet.
// The coffee line is tagged roast_driven:true so the UI can label it.
export default async function handler(req, res) {
  try {
    const { data: catalog } = await supabase
      .from('item_catalog')
      .select('item_code, item_name, reorder_priority, reorder_point_cleans');
    const cat = {};
    (catalog || []).forEach(c => { cat[c.item_code] = c; });

    const { data: stock } = await supabase
      .from('property_stock')
      .select('property_id, item_code, current_on_hand, target_par, min_threshold');

    const { data: props } = await supabase
      .from('properties')
      .select('property_id, property_name, plan_type, coffee_status, coffee_active_lot, coffee_expires_on');
    const propName = {}, coffee = {};
    (props || []).forEach(p => { propName[p.property_id] = p.property_name; coffee[p.property_id] = p; });

    const byProp = {};
    (stock || []).forEach(s => {
      if (!byProp[s.property_id]) byProp[s.property_id] = [];
      byProp[s.property_id].push(s);
    });

    // every property that has stock OR is coffee-reorder-due
    const pids = new Set(Object.keys(byProp));
    Object.keys(coffee).forEach(pid => { if (coffee[pid].coffee_status === 'REORDER_DUE') pids.add(pid); });

    const needsBox = [];
    pids.forEach(pid => {
      const rows = byProp[pid] || [];
      const coffeeReorder = coffee[pid] && coffee[pid].coffee_status === 'REORDER_DUE';

      const triggered = coffeeReorder || rows.some(r => {
        const c = cat[r.item_code];
        return c && c.reorder_priority === 'DRIVER' &&
               r.current_on_hand !== null && r.min_threshold !== null &&
               Number(r.current_on_hand) <= Number(r.min_threshold);
      });
      if (!triggered) return;

      const topoff = [];
      rows.forEach(r => {
        const c = cat[r.item_code] || {};
        const par = Number(r.target_par || 0);
        const onHand = Number(r.current_on_hand || 0);
        const need = par - onHand;
        if (need > 0) {
          topoff.push({
            item_code: r.item_code, item_name: c.item_name || r.item_code,
            priority: c.reorder_priority || '', on_hand: onHand, par, min: r.min_threshold,
            topoff_qty: need,
            is_driver_low: c.reorder_priority === 'DRIVER' && r.min_threshold !== null && onHand <= Number(r.min_threshold)
          });
        }
      });

      // COFFEE PATCH: ensure a CON-017 line when roast-driven reorder is due.
      if (coffeeReorder) {
        const existing = topoff.find(t => t.item_code === 'CON-017');
        const stockRow = rows.find(r => r.item_code === 'CON-017');
        const par = Number(stockRow?.target_par || 0) || 4;
        const onHand = Number(stockRow?.current_on_hand || 0);
        if (existing) { existing.roast_driven = true; existing.topoff_qty = Math.max(existing.topoff_qty, par); }
        else topoff.push({
          item_code: 'CON-017', item_name: (cat['CON-017']?.item_name || 'Coffee Bags') + ' — fresh roast (expires ' + (coffee[pid].coffee_expires_on || '') + ')',
          priority: 'DRIVER', on_hand: onHand, par, min: stockRow?.min_threshold ?? null,
          topoff_qty: par, is_driver_low: true, roast_driven: true
        });
      }

      topoff.sort((a,b) => {
        if (a.is_driver_low !== b.is_driver_low) return a.is_driver_low ? -1 : 1;
        const order = { DRIVER:0, RIDE_ALONG:1, SLOW:2 };
        return (order[a.priority]??3) - (order[b.priority]??3);
      });

      needsBox.push({
        property_id: pid, property_name: propName[pid] || pid,
        item_count: topoff.length,
        driver_low_count: topoff.filter(t => t.is_driver_low).length,
        topoff
      });
    });

    needsBox.sort((a,b) => b.driver_low_count - a.driver_low_count);
    res.status(200).json({ success: true, needsBox, count: needsBox.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
