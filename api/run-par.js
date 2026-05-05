const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const property_id = body.property_id;

    if (!property_id) {
      return res.status(400).json({ success: false, error: 'Missing property_id' });
    }

    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('property_id', property_id)
      .single();

    if (propertyError) {
      return res.status(400).json({ success: false, error: propertyError.message });
    }

    const parCleans = num(property.par_cleans, 10);
    const bathrooms = num(property.bathrooms, 1);
    const sleeps = num(property.sleeps, 2);
    const coffeeEnabled = property.coffee_enabled === true;
    const coffeeType = property.coffee_type;
    const isSignature = property.plan_type === 'SIGNATURE';

    let coffeePods = 0;
    let coffeeBags = 0;
    let sugarPacks = 0;
    let creamerPacks = 0;
    let stirrers = 0;

    const totalCups = Math.ceil(sleeps * 2.5 * parCleans);

    if (coffeeEnabled) {
      sugarPacks = totalCups;
      creamerPacks = totalCups;
      stirrers = totalCups;

      if (coffeeType === 'PODS') {
        coffeePods = totalCups;
        coffeeBags = 0;
      }

      if (coffeeType === 'GROUND') {
        coffeePods = 0;
        coffeeBags = parCleans;
      }

      if (coffeeType === 'BOTH') {
        coffeePods = Math.ceil(totalCups * 0.5);
        coffeeBags = parCleans;
      }
    }

    const rawItems = [
      // Bathroom consumables
      { item_code: 'CON-001', target_par: Math.ceil((bathrooms * 2 + 2) * parCleans) }, // Toilet tissue
      { item_code: 'CON-008', target_par: Math.ceil(bathrooms * 2 * parCleans) }, // Shampoo
      { item_code: 'CON-009', target_par: Math.ceil(bathrooms * 2 * parCleans) }, // Conditioner
      { item_code: 'CON-010', target_par: Math.ceil(bathrooms * 2 * parCleans) }, // Bath/body gel
      { item_code: 'CON-011', target_par: Math.ceil(bathrooms * 6 * parCleans) }, // Makeup wipes

      // Kitchen / general consumables
      { item_code: 'CON-002', target_par: Math.ceil(parCleans * 1) }, // Paper towels
      { item_code: 'CON-003', target_par: 120 }, // Large trash bags fixed full roll
      { item_code: 'CON-004', target_par: 120 }, // Small trash bags fixed full roll
      { item_code: 'CON-005', target_par: Math.ceil(parCleans * 1) }, // Dish liquid
      { item_code: 'CON-007', target_par: Math.ceil(parCleans * 3) }, // Dish pods
      { item_code: 'CON-006', target_par: Math.ceil(parCleans * 3) }, // Laundry packs
      { item_code: 'CON-012', target_par: Math.ceil(parCleans * 0.1) }, // Jet Dry

      // Coffee station
      { item_code: 'CON-016', target_par: coffeePods }, // Coffee pods
      { item_code: 'CON-017', target_par: coffeeBags }, // Coffee bags
      { item_code: 'CON-013', target_par: sugarPacks }, // Sugar packets
      { item_code: 'CON-015', target_par: creamerPacks }, // Creamer
      { item_code: 'CON-014', target_par: stirrers }, // Stirrers

      // Laundry / hospitality
      { item_code: 'MSC-001', target_par: Math.ceil(parCleans * 2) }, // Laundry bags
      { item_code: 'GFT-001', target_par: isSignature ? parCleans : 0 } // Arrival gift
    ];

    const items = rawItems.filter(item => item.target_par > 0);

    const now = new Date().toISOString();

    const rows = items.map(item => ({
      property_id,
      item_code: item.item_code,
      target_par: item.target_par,
      current_on_hand: item.target_par,
      min_threshold: Math.ceil(item.target_par * 0.3),
      last_updated: now
    }));

    const { data, error } = await supabase
      .from('property_stock')
      .upsert(rows, { onConflict: 'property_id,item_code' })
      .select();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      property_id,
      count: data.length,
      rows: data
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
