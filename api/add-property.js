import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function toNumber(value) {
  if (value === '' || value === undefined || value === null) return null;
  return Number(value);
}

function toBoolean(value) {
  return value === true || value === 'true';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const property = {
      property_id: body.property_id,
      property_name: body.property_name,
      owner_id: body.owner_id || null,
      building: body.building || null,
      unit_number: body.unit_number || null,
      region: body.region || null,
      plan_type: body.plan_type || null,
      status: body.status || 'ONBOARDING',
      active: body.status === 'ACTIVE',
      bedrooms: toNumber(body.bedrooms),
      bathrooms: toNumber(body.bathrooms),
      sleeps: toNumber(body.sleeps),
      sq_ft: toNumber(body.sq_ft),
      estimated_clean_hours: toNumber(body.estimated_clean_hours),
      cleaning_fee: toNumber(body.cleaning_fee),
      coffee_enabled: toBoolean(body.coffee_enabled),
      coffee_type: body.coffee_type || null,
      par_cleans: toNumber(body.par_cleans),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('properties')
      .insert([property])
      .select();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
