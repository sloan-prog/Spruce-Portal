import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default async function handler(req, res) {
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
      { item_code: 'TOILET_TISSUE', target_par: Math.ceil(bathrooms * parCleans * 2) },
      { item_code: 'PAPER_TOWELS', target_par: parCleans },
      { item_code: 'LG_TRASH_BAGS', target_par: 120 },
      { item_code: 'SM_TRASH_BAGS', target_par: 120 },
      { item_code: 'MAKEUP_WIPES', target_par: Math.ceil(bathrooms * parCleans) },
      { item_code: 'LAUNDRY_PACKS', target_par: parCleans * 3 },
      { item_code: 'DISH_LIQUID', target_par: parCleans },
      { item_code: 'DISH_PODS', target_par: parCleans * 3 },
      { item_code: 'SHAMPOO', target_par: Math.ceil(bathrooms * parCleans) },
      { item_code: 'CONDITIONER', target_par: Math.ceil(bathrooms * parCleans) },
      { item_code: 'SOAP', target_par: Math.ceil(bathrooms * parCleans) },
      { item_code: 'COFFEE_PODS', target_par: coffeePods },
      { item_code: 'COFFEE_BAGS', target_par: coffeeBags },
      { item_code: 'SUGAR_PACKS', target_par: coffeeEnabled ? totalCups : 0 },
      { item_code: 'CREAMER_PACKS', target_par: coffeeEnabled ? totalCups : 0 },
      { item_code: 'STIRRERS', target_par: coffeeEnabled ? totalCups : 0 },
      { item_code: 'ARRIVAL_GIFT', target_par: isSignature ? parCleans : 0 }
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
