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

    // Diagnostic: what keys did we get and what's in the cleaner field?
    console.log('KEYS:', JSON.stringify(Object.keys(raw)));
    console.log('CLEANER_FIELD type:', typeof raw.q20_cleanerName);
    console.log('CLEANER_FIELD value:', JSON.stringify(raw.q20_cleanerName));
    console.log('BRACKETED first:', JSON.stringify(raw['q20_cleanerName[first]']));
    console.log('BRACKETED last:',  JSON.stringify(raw['q20_cleanerName[last]']));

    const submission_id = fields.submissionID || '';
    const property_id   = raw.q3_property_id  || '';
    if (!property_id) {
      console.log('Missing property_id. Keys:', Object.keys(raw));
      return res.status(400).json({ error: 'Missing property_id' });
    }

    // Cleaner extraction — defensive, handles every JotForm name shape we've seen.
    let cleaner_first = '';
    let cleaner_last  = '';
    const nameField = raw.q20_cleanerName;

    if (nameField && typeof nameField === 'object') {
      // JotForm Full Name / Name field — object with first/last (and possibly prefix/middle/suffix)
      cleaner_first = String(nameField.first || nameField.first_name || '').trim();
      cleaner_last  = String(nameField.last  || nameField.last_name  || '').trim();
    } else if (typeof nameField === 'string' && nameField.trim()) {
      const str = nameField.trim();
      // Try parsing as JSON in case it's a stringified object
      let parsed = null;
      try { parsed = JSON.parse(str); } catch {}
      if (parsed && typeof parsed === 'object') {
        cleaner_first = String(parsed.first || parsed.first_name || '').trim();
        cleaner_last  = String(parsed.last  || parsed.last_name  || '').trim();
      } else {
        // Plain "First Last" string — split on first space
        const firstSpace = str.indexOf(' ');
        cleaner_first = firstSpace === -1 ? str : str.slice(0, firstSpace);
        cleaner_last  = firstSpace === -1 ? ''  : str.slice(firstSpace + 1);
      }
    }

    // Fallback: bracketed sibling keys (multipart form-data style)
    if (!cleaner_first && raw['q20_cleanerName[first]']) {
      cleaner_first = String(raw['q20_cleanerName[first]']).trim();
    }
    if (!cleaner_last && raw['q20_cleanerName[last]']) {
      cleaner_last = String(raw['q20_cleanerName[last]']).trim();
    }

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

    console.log('ROW being inserted:', JSON.stringify({ cleaner_first, cleaner_last }));

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
