const { createClient } = require('@supabase/supabase-js');
const Busboy = require('busboy');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports.config = {
  api: { bodyParser: false },
};

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const bb = Busboy({ headers: req.headers });
    bb.on('field', (name, val) => { fields[name] = val; });
    bb.on('finish', () => resolve(fields));
    bb.on('error', reject);
    req.pipe(bb);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const fields = await parseMultipart(req);
    console.log('FIELDS:', JSON.stringify(fields).slice(0, 500));

    // JotForm sends rawRequest as a JSON string inside the multipart
    let raw = {};
    if (fields.rawRequest) {
      try {
        raw = JSON.parse(fields.rawRequest);
      } catch {
        raw = fields;
      }
    } else {
      raw = fields;
    }

    console.log('RAW:', JSON.stringify(raw).slice(0, 500));

    const submission_id = fields.submissionID || raw.submissionID || '';
    const property_id   = raw.property_id || raw.propertyid || '';

    if (!property_id) {
      console.log('Missing property_id. Keys:', Object.keys(raw));
      return res.status(400).json({ error: 'Missing property_id' });
    }

    const row = {
      submission_id:          String(submission_id),
      submission_date:        new Date().toISOString(),
      property_id:            String(property_id),
      property_name:          String(raw.property       || ''),
      bedrooms:               Number(raw.beds)           || null,
      bathrooms:              Number(raw.baths)          || null,
      sleeps:                 Number(raw.sleeps)         || null,
      plan_type:              String(raw.plan_type       || ''),
      coffee_enabled:         String(raw.coffeeenabled   || ''),
      coffee_type:            String(raw.coffee_type     || ''),
      toilet_tissue:          Number(raw.toilettissue)   || 0,
      sm_trash_bags:          Number(raw.smalltrashbags) || 0,
      shampoo:                Number(raw.shampoo)        || 0,
      conditioner:            Number(raw.conditioner)    || 0,
      soap:                   Number(raw.soap)           || 0,
      makeup_wipes:           Number(raw.makeupwipes)    || 0,
      bathroom_at_standard:   String(raw.bathroomadjusted   || ''),
      toilet_tissue_adjusted: Number(raw.toilettissueadjusted)  || 0,
      sm_trash_bag_adjusted:  Number(raw.smalltrashbagadjusted) || 0,
      makeup_wipes_adjusted:  Number(raw.makeupwipesadjusted)   || 0,
      shampoo_adjusted:       Number(raw.shampooajusted)    || 0,
      conditioner_adjusted:   Number(raw.conditioneradjusted)   || 0,
      soap_adjusted:          Number(raw.soapadjusted)      || 0,
      paper_towels:           Number(raw.papertowels)    || 0,
      lg_trash_bags:          Number(raw.largetrashbags) || 0,
      dish_liquid:            Number(raw.dishliquid)     || 0,
      dish_pods:              Number(raw.dishpods)       || 0,
      laundry_packs:          Number(raw.laundrypacks)   || 0,
      kitchen_at_standard:    String(raw.kitchenadjusted    || ''),
      paper_towels_adjusted:  Number(raw.papertowelsadjusted)   || 0,
      lg_trash_bags_adjusted: Number(raw.largetrashbagsadjusted) || 0,
      dish_liquid_adjusted:   Number(raw.dishliquidadjusted)    || 0,
      dish_pods_adjusted:     Number(raw.dishpodsadjusted)  || 0,
      laundry_packs_adjusted: Number(raw.laundrypacksadjusted)  || 0,
      coffee_pods:            Number(raw.coffeepods)     || 0,
      coffee_bags:            Number(raw.coffeebags)     || 0,
      sugar:                  Number(raw.sugar)          || 0,
      creamer:                Number(raw.creamer)        || 0,
      stirrers:               Number(raw.stirrers)       || 0,
      coffee_at_standard:     String(raw.coffeeadjusted     || ''),
      coffee_pods_adjusted:   Number(raw.coffeepodsadjusted)    || 0,
      coffee_bags_adjusted:   Number(raw.coffeebagsadjusted)    || 0,
      sugar_adjusted:         Number(raw.sugaradjusted)  || 0,
      creamer_adjusted:       Number(raw.creameradjusted)   || 0,
      stirrers_adjusted:      Number(raw.stirrersadjusted)  || 0,
      arrival_gift:           Number(raw.arrivalgifts)   || 0,
      processed: false,
    };

    const { error: insertError } = await supabase
      .from('raw_closet_to_counter')
      .insert(row);

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(400).json({ error: insertError.message });
    }

    if (row.property_id) {
      const deductions = [
        { item_code: 'CON-001', qty: row.toilet_tissue_adjusted || row.toilet_tissue },
        { item_code: 'CON-004', qty: row.sm_trash_bag_adjusted  || row.sm_trash_bags },
        { item_code: 'CON-008', qty: row.shampoo_adjusted       || row.shampoo },
        { item_code: 'CON-009', qty: row.conditioner_adjusted   || row.conditioner },
        { item_code: 'CON-010', qty: row.soap_adjusted          || row.soap },
        { item_code: 'CON-011', qty: row.makeup_wipes_adjusted  || row.makeup_wipes },
        { item_code: 'CON-002', qty: row.paper_towels_adjusted  || row.paper_towels },
        { item_code: 'CON-003', qty: row.lg_trash_bags_adjusted || row.lg_trash_bags },
        { item_code: 'CON-005', qty: row.dish_liquid_adjusted   || row.dish_liquid },
        { item_code: 'CON-007', qty: row.dish_pods_adjusted     || row.dish_pods },
        { item_code: 'CON-006', qty: row.laundry_packs_adjusted || row.laundry_packs },
        { item_code: 'CON-016', qty: row.coffee_pods_adjusted   || row.coffee_pods },
        { item_code: 'CON-017', qty: row.coffee_bags_adjusted   || row.coffee_bags },
        { item_code: 'CON-013', qty: row.sugar_adjusted         || row.sugar },
        { item_code: 'CON-015', qty: row.creamer_adjusted       || row.creamer },
        { item_code: 'CON-014', qty: row.stirrers_adjusted      || row.stirrers },
        { item_code: 'GFT-001', qty: row.arrival_gift },
      ].filter(d => d.qty > 0);

      for (const d of deductions) {
        await supabase.rpc('decrement_stock', {
          p_property_id: row.property_id,
          p_item_code:   d.item_code,
          p_qty:         d.qty,
        });
      }
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
