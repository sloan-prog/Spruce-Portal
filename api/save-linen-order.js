const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

// Maps each linen SKU (as emitted by /api/calculate-linen-order) to its column
// in property_linen_inventory. Sheets: king/queen/full/twin x fitted/flat/
// pillowcase/insert. Towels by type. (Sofa is already folded into the FULL
// SKUs by the calculator, so it lands in the full_* columns.)
const SKU_COLUMN = {
  'SHT-001': 'king_fitted',  'SHT-002': 'king_flat',  'SHT-003': 'king_pillowcase',  'SHT-004': 'king_insert',
  'SHT-009': 'queen_fitted', 'SHT-010': 'queen_flat', 'SHT-011': 'queen_pillowcase', 'SHT-012': 'queen_insert',
  'SHT-014': 'full_fitted',  'SHT-015': 'full_flat',  'SHT-016': 'full_pillowcase',  'SHT-017': 'full_insert',
  'SHT-019': 'twin_fitted',  'SHT-020': 'twin_flat',  'SHT-021': 'twin_pillowcase',  'SHT-022': 'twin_insert',
  'TWL-001': 'bath_towels',  'TWL-002': 'washcloths', 'TWL-003': 'hand_towels',
  'TWL-004': 'bath_mats',    'TWL-006': 'kitchen_towels', 'TWL-007': 'kitchen_washcloths'
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const propertyId = body.property_id;
    if (!propertyId) {
      return res.status(400).json({ success: false, error: 'Missing property_id' });
    }

    const items = Array.isArray(body.items) ? body.items : [];

    // Zero-initialise every mapped column so a re-save reflects the current bed
    // mix: if a bed type was removed, its SKUs won't be in `items` and the
    // column is written back to 0 rather than left stale.
    const row = { property_id: propertyId, updated_at: new Date().toISOString() };
    Object.values(SKU_COLUMN).forEach(col => { row[col] = 0; });

    items.forEach(it => {
      const col = SKU_COLUMN[it && it.item_code];
      if (col) row[col] = num(it.quantity);
    });

    row.total_linen_cost = roundMoney(body.total_linen_cost);
    row.linen_fee_charged = roundMoney(body.linen_fee_charged);
    row.net_linen_to_recoup = roundMoney(body.net_linen_to_recoup);

    // Upsert keyed on property_id so there is exactly one row per property.
    const { data, error } = await supabase
      .from('property_linen_inventory')
      .upsert(row, { onConflict: 'property_id' })
      .select();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
