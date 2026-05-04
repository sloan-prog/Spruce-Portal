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
    const { property_id } = body;

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

    const cupsPerClean = Math.ceil(sleeps * 2.5);
    const totalCups = cupsPerClean * parCleans;

    let coffeePods = 0;
    let coffeeBags = 0;

    if (coffeeEnabled && coffeeType === 'PODS') {
      coffeePods = totalCups;
    }

    if (coffeeEnabled && coffeeType === 'GROUND') {
      coffeeBags = Math.ceil(totalCups / 20);
    }

    if (coffeeEnabled && coffeeType === 'BOTH') {
      coffeePods = Math.ceil(totalCups * 0.6);
      coffeeBags = Math.ceil((totalCups * 0.4) / 20);
    }

    const items = [
      const items = [
  { item_code: 'CON-001', target_par: Math.ceil(bathrooms * parCleans * 2) }, // Toilet Paper
  { item_code: 'CON-002', target_par: parCleans }, // Paper Towels
  { item_code: 'CON-003', target_par: 120 }, // Large Trash Bags
  { item_code: 'CON-004', target_par: 120 }, // Small Trash Bags
  { item_code: 'CON-011', target_par: Math.ceil(bathrooms * parCleans) }, // Makeup Wipes
  { item_code: 'CON-006', target_par: parCleans * 3 }, // Laundry Packs
  { item_code: 'CON-005', target_par: parCleans }, // Dish Liquid
  { item_code: 'CON-007', target_par: parCleans * 3 }, // Dishwasher Pods
  { item_code: 'CON-008', target_par: Math.ceil(bathrooms * parCleans) }, // Shampoo
  { item_code: 'CON-009', target_par: Math.ceil(bathrooms * parCleans) }, // Conditioner
  { item_code: 'CON-010', target_par: Math.ceil(bathrooms * parCleans) }, // Body Gel/Soap
  { item_code: 'CON-016', target_par: coffeePods }, // Coffee Pods
  { item_code: 'CON-017', target_par: coffeeBags }, // Coffee Bags
  { item_code: 'CON-013', target_par: coffeeEnabled ? totalCups : 0 }, // Sugar
  { item_code: 'CON-015', target_par: coffeeEnabled ? totalCups : 0 }, // Creamer
  { item_code: 'CON-014', target_par: coffeeEnabled ? totalCups : 0 } // Stirrers
  { item_code: 'GFT-001', target_par: isSignature ? parCleans : 0 }    
];
    ];

    const rows = items.map(item => ({
      property_id,
      item_code: item.item_code,
      target_par: item.target_par,
      current_on_hand: item.target_par,
      min_threshold: Math.ceil(item.target_par * 0.3),
      last_updated: new Date().toISOString()
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
      rows: data
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
