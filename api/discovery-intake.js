const { createClient } = require('@supabase/supabase-js');
const Busboy = require('busboy');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports.config = { api: { bodyParser: false } };

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

// pick a value trying several possible JotForm field keys
function pick(raw, keys) {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') return raw[k];
  }
  return null;
}
function toNum(v) { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; }

// JotForm name/address composite fields arrive as JSON-ish strings or sub-keys; flatten best-effort.
function joinName(raw, base) {
  const first = raw[base + '[first]'] || raw[base + '_first'];
  const last = raw[base + '[last]'] || raw[base + '_last'];
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const fields = await parseMultipart(req);
    let raw = {};
    if (fields.rawRequest) { try { raw = JSON.parse(fields.rawRequest); } catch { raw = fields; } }
    else { raw = fields; }

    // DEBUG: dump raw so we can confirm/lock exact field IDs from the first test.
    console.log('DISCOVERY RAW:', JSON.stringify(raw));
    try { await supabase.from('audit_debug').insert({ raw_payload: raw }); } catch (e) {}

    // Best-effort field mapping (will be tightened after we see the real field IDs).
    const owner_name = joinName(raw, 'q3_yourName') || joinName(raw, 'q3_name') ||
      pick(raw, ['q3_yourName', 'q3_name', 'yourName', 'name']);
    const owner_email = pick(raw, ['q4_email', 'q4_Email', 'email', 'Email']);
    const owner_phone = pick(raw, ['q5_phone', 'q5_Phone', 'phone', 'Phone', 'q5_phoneNumber']);
    const street = pick(raw, ['q7_streetAddress', 'q7_street', 'streetAddress']);
    const building = pick(raw, ['q8_buildingUnit', 'q8_building', 'buildingUnit']);
    const city = pick(raw, ['q9_city', 'city']);
    const zip = pick(raw, ['q10_zipCode', 'q10_zip', 'zipCode']);
    const bedrooms = toNum(pick(raw, ['q11_bedrooms', 'bedrooms']));
    const bathrooms = toNum(pick(raw, ['q12_bathrooms', 'bathrooms']));
    const sleeps = toNum(pick(raw, ['q13_maximumGuests', 'q13_sleeps', 'maximumGuests', 'sleeps']));
    const listing = pick(raw, ['q14_linkTo', 'q14_listing', 'listing']);
    const managed = pick(raw, ['q16_howIs', 'q16_managed', 'howIs']);
    const turnovers = pick(raw, ['q17_approximateTurnovers', 'turnovers']);
    const services = pick(raw, ['q19_whatServices', 'services']);
    const apptTime = pick(raw, ['q22_preferredAppointment', 'q22_schedule', 'schedule', 'appointment']);

    const row = {
      owner_name: owner_name || null,
      owner_email: owner_email || null,
      owner_phone: owner_phone || null,
      property_street_address: street || null,
      building: building || null,
      property_city: city || null,
      property_zipcode: zip ? String(zip) : null,
      bedrooms, bathrooms, sleeps,
      onboarding_stage: 'LEAD',
      status: 'NEW',
      source: 'discovery_call',
      submitted_at: new Date().toISOString(),
      notes: [listing ? ('Listing: ' + listing) : null,
              managed ? ('Managed: ' + managed) : null,
              turnovers ? ('Turnovers/mo: ' + turnovers) : null,
              services ? ('Interested in: ' + services) : null,
              apptTime ? ('Preferred call: ' + apptTime) : null].filter(Boolean).join(' | ') || null,
      payload: raw   // full submission kept for reference / later field-tightening
    };

    const { error } = await supabase.from('property_onboarding_submissions').insert(row);
    if (error) { console.error('discovery insert error:', error.message); return res.status(500).json({ error: error.message }); }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('discovery handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
