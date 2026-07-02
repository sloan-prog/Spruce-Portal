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

function getConfig(configRows, key, fallback = 0) {
  const row = configRows.find(r => r.config_key === key);
  return row ? num(row.config_value, fallback) : fallback;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Bed / room counts from the form.
    const king = num(body.king);
    const queen = num(body.queen);
    const fullBeds = num(body.full_beds);
    const twin = num(body.twin);
    const sofa = num(body.sofa); // sofa counts as full
    const bathrooms = num(body.bathrooms);
    const sleeps = num(body.sleeps);
    const bedrooms = num(body.bedrooms);

    // Sofa beds are treated as full-size beds (same as the pricing engine's
    // fullEquivalent logic) so they use the Full-size sheet SKUs.
    const fullEquivalent = fullBeds + sofa;

    // --- Config (PAR levels + linen fee) read from spruce_config, not hardcoded.
    const { data: configRows, error: configError } = await supabase
      .from('spruce_config')
      .select('*');

    if (configError) {
      return res.status(400).json({ success: false, error: configError.message });
    }

    const sheetPar = getConfig(configRows, 'sheet_par', 2);
    const towelPar = getConfig(configRows, 'towel_par', 3);
    const linenFeePerBed = getConfig(configRows, 'linen_fee_per_bedroom', 175);

    // --- Catalog: pull all sheet (SHT-) and towel (TWL-) SKUs + unit cost.
    const { data: catalogRows, error: catalogError } = await supabase
      .from('item_catalog')
      .select('item_code,item_name,cost_per_unit');

    if (catalogError) {
      return res.status(400).json({ success: false, error: catalogError.message });
    }

    const catalog = (catalogRows || []).filter(
      i => typeof i.item_code === 'string' &&
        (i.item_code.startsWith('SHT-') || i.item_code.startsWith('TWL-'))
    );

    function itemCost(itemCode) {
      const item = catalog.find(i => i.item_code === itemCode);
      return item ? num(item.cost_per_unit, 0) : 0;
    }

    // --- Build the linen order (same SKU/quantity formulas as the pricing engine).
    const items = [];

    function addLinen(item_code, qty) {
      if (qty <= 0) return;
      const catalogItem = catalog.find(i => i.item_code === item_code);
      const unitCost = itemCost(item_code);
      const total = unitCost * qty;

      items.push({
        item_code,
        item_name: catalogItem ? catalogItem.item_name : item_code,
        quantity: qty,
        unit_cost: roundMoney(unitCost),
        line_total: roundMoney(total)
      });
    }

    // Sheets, PAR = sheet_par
    // KING
    addLinen('SHT-001', king * sheetPar);         // King fitted
    addLinen('SHT-002', king * sheetPar * 3);     // Triple-sheet flats
    addLinen('SHT-003', king * 4 * sheetPar);     // Pillowcases
    addLinen('SHT-004', king * 2);                // Inserts

    // QUEEN
    addLinen('SHT-009', queen * sheetPar);        // Queen fitted
    addLinen('SHT-010', queen * sheetPar * 2);    // Triple-sheet flats
    addLinen('SHT-011', queen * 4 * sheetPar);    // Pillowcases
    addLinen('SHT-012', queen * 2);               // Inserts

    // FULL + SOFA (sofa treated as full)
    addLinen('SHT-014', fullEquivalent * sheetPar);       // Full fitted
    addLinen('SHT-015', fullEquivalent * sheetPar * 2);   // Triple-sheet flats
    addLinen('SHT-016', fullEquivalent * 2 * sheetPar);   // Pillowcases
    addLinen('SHT-017', fullEquivalent * 2);              // Inserts

    // TWIN
    addLinen('SHT-019', twin * sheetPar);         // Twin fitted
    addLinen('SHT-020', twin * sheetPar * 2);     // Triple-sheet flats
    addLinen('SHT-021', twin * 1 * sheetPar);     // Pillowcases
    addLinen('SHT-022', twin * 2);                // Inserts

    // Towels, PAR = towel_par
    addLinen('TWL-001', sleeps * towelPar);       // Bath towels
    addLinen('TWL-002', sleeps * towelPar);       // Washcloths
    addLinen('TWL-003', sleeps * towelPar);       // Hand towels
    addLinen('TWL-004', bathrooms * towelPar);    // Bath mats
    addLinen('TWL-006', 2 * towelPar);            // Kitchen towels
    addLinen('TWL-007', 2 * towelPar);            // Kitchen washcloths

    const linenOrderTotal = items.reduce((sum, r) => sum + Number(r.line_total || 0), 0);
    const linenFeeCharged = bedrooms * linenFeePerBed;
    const amountToRecoup = linenOrderTotal - linenFeeCharged;

    return res.status(200).json({
      success: true,
      inputs: {
        king, queen, full_beds: fullBeds, twin, sofa,
        full_equivalent: fullEquivalent, bathrooms, sleeps, bedrooms
      },
      config: {
        sheet_par: sheetPar,
        towel_par: towelPar,
        linen_fee_per_bedroom: linenFeePerBed
      },
      items,
      grand_total: roundMoney(linenOrderTotal),
      linen_order_total: roundMoney(linenOrderTotal),
      linen_fee_charged: roundMoney(linenFeeCharged),
      amount_to_recoup: roundMoney(amountToRecoup)
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
