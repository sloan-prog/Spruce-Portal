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
    let raw = {};
    if (fields.rawRequest) {
      try { raw = JSON.parse(fields.rawRequest); }
      catch { raw = fields; }
    } else {
      raw = fields;
    }
    const submission_id = fields.submissionID || '';
    const property_id   = raw.q3_property_id  || '';
    if (!property_id) {
      console.log('Missing property_id. Keys:', Object.keys(raw));
      return res.status(400).json({ error: 'Missing property_id' });
    }
    // Cleaner is one combined name field (q20_cleanerName). Split on first space.
    const cleanerFull   = String(raw.q20_cleanerName || '').trim();
    const firstSpace    = cleanerFull.indexOf(' ');
    const cleaner_first = firstSpace === -1 ? cleanerFull : cleanerFull.slice(0, firstSpace);
    const cleaner_last  = firstSpace === -1 ? ''          : cleanerFull.slice(firstSpace + 1);
    const row = {
      submission_id:   String(submission_id),
      submission_date: new Date().toISOString(),
      property_id:     String(raw.q3_property_id     || ''),
      property_name:   String(raw.q5_property        || ''),
      bedrooms:        Number(raw.q6_beds)            || null,
      bathrooms:       Number(raw.q7_baths)           || null,
      sleeps:          Number(raw.q8_sleeps)          || null,
      estimated_hours: Number(raw.q9_estimated_hours) || null,
      plan_type:       String(raw.q12_plan_type       || ''),
      coffee_type:     String(raw.q10_coffee_type     || ''),
      clean_id:        String(raw.q14_clean_id        || ''),
      cleaner_first,
      cleaner_last,
      processed:       false,
    };
    const { error: insertError } = await supabase
      .from('raw_begin_clean')
      .insert(row);
    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(400).json({ error: insertError.message });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
