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

// --- Per-property JotForm link + QR generation ---
// Every form uses the same prefill params, only the form ID differs.
const FORMS = {
  closet_to_counter: '252149394680060',
  audit:             '262628561852161',
  begin_clean:       '260188429565063',
  complete_clean:    '260127098190052',
  laundry:           '252026478022047',
  non_urgent:        '253514722122043',
  cleaning_task_1:   '253408739899074',
};

function buildLinks(p) {
  // shared prefill query string built from the property's current data
  const q =
    '?property_id=' + encodeURIComponent(p.property_id || '') +
    '&property='    + encodeURIComponent(p.property_name || '') +
    '&beds='        + (p.bedrooms != null ? p.bedrooms : '') +
    '&baths='       + (p.bathrooms != null ? p.bathrooms : '') +
    '&sleeps='      + (p.sleeps != null ? p.sleeps : '') +
    '&plan_type='   + encodeURIComponent(p.plan_type || '') +
    '&coffee_type=' + encodeURIComponent(p.coffee_type || '') +
    '&parcleans='   + (p.par_cleans != null ? p.par_cleans : 10);

  const out = {};
  for (const [name, formId] of Object.entries(FORMS)) {
    const link = 'https://form.jotform.com/' + formId + q;
    out[name + '_link'] = link;
    // QR rendered on-demand by a QR service from the link (no image generation needed)
    out[name + '_qr'] = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(link);
  }
  return out;
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
      king: toNumber(body.king),
      queen: toNumber(body.queen),
      full_beds: toNumber(body.full_beds),
      twin: toNumber(body.twin),
      sofa: toNumber(body.sofa),
      shower_curtains_needed: toNumber(body.shower_curtains_needed),
      sq_ft: toNumber(body.sq_ft),
      estimated_clean_hours: toNumber(body.estimated_clean_hours),
      cleaning_fee: toNumber(body.cleaning_fee),
      coffee_enabled: toBoolean(body.coffee_enabled),
      coffee_type: body.coffee_type || null,
      par_cleans: toNumber(body.par_cleans),
      updated_at: new Date().toISOString()
    };

    // Auto-generate all per-property form links + QRs from the property's data.
    // Runs on every add AND edit (upsert), so links always reflect current data
    // (e.g. a tier change or coffee_type change refreshes them).
    Object.assign(property, buildLinks(property));

    // Upsert on property_id so editing an existing property updates its row
    // instead of inserting a duplicate. New properties are still inserted.
    const { data, error } = await supabase
      .from('properties')
      .upsert(property, { onConflict: 'property_id' })
      .select();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
