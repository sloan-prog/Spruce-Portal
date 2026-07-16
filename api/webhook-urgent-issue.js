const { createClient } = require('@supabase/supabase-js');
const Busboy = require('busboy');

// Service-role only (never anon) — matches every other intake handler in this repo.
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

// Defensive: JotForm sends qN_-prefixed keys; field IDs vary by form.
// Accept the plain name OR any qN_<name> variant.
function pick(raw, ...names) {
  for (const n of names) {
    if (raw[n] != null && raw[n] !== '') return raw[n];
    const hit = Object.keys(raw).find(k => k === n || k.endsWith('_' + n) || k.replace(/^q\d+_/, '') === n);
    if (hit && raw[hit] != null && raw[hit] !== '') return raw[hit];
  }
  return null;
}
const asText = (v) => (v == null ? null : (typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })()));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const fields = await parseMultipart(req);
    let raw = {};
    if (fields.rawRequest) { try { raw = JSON.parse(fields.rawRequest); } catch { raw = fields; } }
    else raw = fields;

    const submission_id = fields.submissionID || '';
    const property_id = asText(pick(raw, 'property_id')) || '';
    const submission_url = submission_id ? `https://www.jotform.com/pdf-submission/${submission_id}` : null;

    const row = {
      submission_id: String(submission_id),
      submission_date: new Date().toISOString(),
      property_type: asText(pick(raw, 'property_type')),
      building: asText(pick(raw, 'building')),
      unit_number: asText(pick(raw, 'unit_number', 'unit')),
      property_address: asText(pick(raw, 'property_address', 'address')),
      property_city: asText(pick(raw, 'property_city', 'city')),
      issue_type: asText(pick(raw, 'issue_type', 'issueType')),
      description: asText(pick(raw, 'description', 'details')),
      photo_1: asText(pick(raw, 'photo_1', 'photo1')),
      photo_2: asText(pick(raw, 'photo_2', 'photo2')),
      photo_3: asText(pick(raw, 'photo_3', 'photo3')),
      photo_4: asText(pick(raw, 'photo_4', 'photo4')),
      issue_date: new Date().toISOString(),
      cleaner_first: asText(pick(raw, 'cleaner_first')),
      cleaner_last: asText(pick(raw, 'cleaner_last')),
      can_complete_clean: asText(pick(raw, 'can_complete_clean', 'canCompleteClean')),
      submission_url,
      property_id: String(property_id),
      clean_id: asText(pick(raw, 'clean_id')),
      processed: false,
    };

    const { error } = await supabase.from('raw_urgent_issues').insert(row);
    if (error) { console.error('Insert error:', error); return res.status(400).json({ error: error.message }); }
    return res.status(200).json({ success: true, submission_url });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
