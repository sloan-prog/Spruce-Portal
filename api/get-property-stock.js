const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  try {
    const { property_id } = req.query;

    if (!property_id) {
      return res.status(400).json({ success: false, error: 'Missing property_id' });
    }

    const { data, error } = await supabase
      .from('property_stock')
      .select(`
        property_id,
        item_code,
        target_par,
        current_on_hand,
        min_threshold,
        last_updated,
        item_catalog (
          item_name,
          cost_per_unit
        )
      `)
      .eq('property_id', property_id)
      .order('item_code', { ascending: true });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    const rows = (data || []).map(row => {
      const unitCost = Number(row.item_catalog?.cost_per_unit || 0);
      const onHand = Number(row.current_on_hand || 0);

      return {
        item_code: row.item_code,
        item_name: row.item_catalog?.item_name || row.item_code,
        target_par: row.target_par,
        current_on_hand: row.current_on_hand,
        min_threshold: row.min_threshold,
        unit_cost: unitCost,
        total_value: onHand * unitCost,
        last_updated: row.last_updated
      };
    });

    const total_value = rows.reduce((sum, row) => sum + Number(row.total_value || 0), 0);

    return res.status(200).json({
      success: true,
      property_id,
      total_value,
      rows
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
