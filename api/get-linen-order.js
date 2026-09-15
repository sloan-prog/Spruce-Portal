const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Reverse of the SKU->column map in save-linen-order.js: column -> SKU
const COLUMN_SKU = {
  king_fitted: 'SHT-001',  king_flat: 'SHT-002',  king_pillowcase: 'SHT-003',  king_insert: 'SHT-004',
  queen_fitted: 'SHT-009', queen_flat: 'SHT-010', queen_pillowcase: 'SHT-011', queen_insert: 'SHT-012',
  full_fitted: 'SHT-014',  full_flat: 'SHT-015',  full_pillowcase: 'SHT-016',  full_insert: 'SHT-017',
  twin_fitted: 'SHT-019',  twin_flat: 'SHT-020',  twin_pillowcase: 'SHT-021',  twin_insert: 'SHT-022',
  bath_towels: 'TWL-001',  washcloths: 'TWL-002', hand_towels: 'TWL-003',
  bath_mats: 'TWL-004',    kitchen_towels: 'TWL-006', kitchen_washcloths: 'TWL-007',
  shower_curtains: 'TWL-005', kitchen_potholders: 'TWL-008', laundry_bags: 'MSC-001'
};

module.exports = async function handler(req, res) {
  try {
    const propertyId = req.query.property_id;
    if (!propertyId) {
      return res.status(400).json({ success: false, error: 'Missing property_id' });
    }

    // Load the saved linen inventory row for this property
    const { data: row, error } = await supabase
      .from('property_linen_inventory')
      .select('*')
      .eq('property_id', propertyId)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (!row) {
      return res.status(200).json({ success: true, has_order: false });
    }

    // Load catalog for names + unit costs
    const { data: catalog } = await supabase
      .from('item_catalog')
      .select('item_code,item_name,cost_per_unit');
    const cat = {};
    (catalog || []).forEach(c => { cat[c.item_code] = c; });

    // Rebuild the itemized list from the saved quantity columns
    const items = [];
    Object.keys(COLUMN_SKU).forEach(col => {
      const qty = Number(row[col] || 0);
      if (qty > 0) {
        const code = COLUMN_SKU[col];
        const c = cat[code] || {};
        const unit = Number(c.cost_per_unit || 0);
        items.push({
          item_code: code,
          item_name: c.item_name || code,
          quantity: qty,
          unit_cost: unit,
          line_total: Math.round(unit * qty * 100) / 100
        });
      }
    });

    return res.status(200).json({
      success: true,
      has_order: items.length > 0,
      items,
      total_linen_cost: Number(row.total_linen_cost || 0),
      order_status: row.order_status || 'draft',
      order_placed_date: row.order_placed_date || null,
      order_received_date: row.order_received_date || null,
      initial_load_date: row.initial_load_date || null,
      checkoff_state: row.checkoff_state || {},
      updated_at: row.updated_at || null
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
