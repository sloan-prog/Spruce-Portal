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
    const arr = pick(raw, 'arrangements_needed', 'arrangements');

    const row = {
      submission_id: String(submission_id),
      submission_date: new Date().toISOString(),
      property_id: String(property_id),
      property_name: asText(pick(raw, 'property_name', 'property')),
      clean_id: asText(pick(raw, 'clean_id')),
      arrangements_needed: arr != null ? Number(arr) || null : null,
      action: asText(pick(raw, 'action')),   // RESTOCK / LEAVE / REMOVE
      photo_1: asText(pick(raw, 'photo_1', 'photo1')),
      completed_by: asText(pick(raw, 'completed_by', 'completedBy')),
      notes: asText(pick(raw, 'notes')),
      processed: false,
    };

    const { error } = await supabase.from('raw_floral').insert(row);
    if (error) { console.error('Insert error:', error); return res.status(400).json({ error: error.message }); }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
