import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Returns atelier (warehouse) stock with reorder flags + a low-count summary.
export default async function handler(req, res) {
  try {
    const { data: rows } = await supabase
      .from('warehouse_stock')
      .select('item_code, item_name, category, units_on_hand, reorder_point, warehouse_par, current_season_par, unit_cost, vendor, last_order_date, last_received_date');

    const items = (rows || []).map(r => {
      const onHand = Number(r.units_on_hand ?? 0);
      const par = Number(r.current_season_par ?? r.warehouse_par ?? 0);
      const reorder = Number(r.reorder_point ?? 0);
      const low = reorder > 0 && onHand <= reorder;
      const topoff = par > onHand ? par - onHand : 0;
      return {
        item_code: r.item_code,
        item_name: r.item_name,
        category: r.category,
        on_hand: onHand,
        par,
        reorder_point: reorder,
        low,
        topoff_to_par: topoff,
        unit_cost: r.unit_cost,
        vendor: r.vendor,
        last_order_date: r.last_order_date,
        last_received_date: r.last_received_date
      };
    });

    items.sort((a, b) => {
      if (a.low !== b.low) return a.low ? -1 : 1;
      return (a.item_name || '').localeCompare(b.item_name || '');
    });

    const lowItems = items.filter(i => i.low);
    // group low items by vendor (what to order from whom)
    const byVendor = {};
    lowItems.forEach(i => {
      const v = i.vendor || 'Unassigned';
      if (!byVendor[v]) byVendor[v] = [];
      byVendor[v].push(i);
    });

    res.status(200).json({
      success: true,
      items,
      low_count: lowItems.length,
      total_items: items.length,
      reorder_by_vendor: byVendor
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
