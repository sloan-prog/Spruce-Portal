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

    // Exact field mapping (locked from real submission 10/5).
    const nm = raw.q5_q5_fullname3 || {};
    const owner_name = [nm.first, nm.last].filter(Boolean).join(' ') || null;
    const owner_email = pick(raw, ['q6_q6_email4']);
    const ph = raw.q7_q7_phone5 || {};
    const owner_phone = ph.full || pick(raw, ['q7_q7_phone5']);
    const street = pick(raw, ['q11_q11_textbox9']);
    const building = pick(raw, ['q12_q12_textbox10']);
    const city = pick(raw, ['q13_q13_textbox11']);
    const zip = pick(raw, ['q14_q14_textbox12']);
    const bedrooms = toNum(pick(raw, ['q15_q15_number13']));
    const bathrooms = toNum(pick(raw, ['q16_q16_number14']));
    const sleeps = toNum(pick(raw, ['q17_q17_number15']));
    const listing = pick(raw, ['q18_q18_textbox16']);
    const managed = pick(raw, ['q20_q20_radio18']);
    const turnovers = pick(raw, ['q22_q22_radio20']);
    let servicesRaw = raw.q24_q24_checkbox22;
    const services = Array.isArray(servicesRaw) ? servicesRaw.join(', ') : (servicesRaw || null);
    const apptSlot = raw['appointmentSlot-input_31'];
    const apptObj = raw.q31_preferredAppointment || {};
    const apptTime = apptSlot || apptObj.date || null;

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
