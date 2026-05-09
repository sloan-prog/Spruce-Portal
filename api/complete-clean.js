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

    console.log('KEYS:', JSON.stringify(Object.keys(raw)));

    // ---- Field mapping confirmed from KEYS log ----

    const submission_id = fields.submissionID || '';
    const property_id   = raw.q8_property_id || '';

    if (!property_id) {
      console.log('Missing property_id. Keys:', Object.keys(raw));
      return res.status(400).json({ error: 'Missing property_id' });
    }

    // Cleaner is one combined name field on this form. Split on first space.
    const cleanerFull   = String(raw.q15_cleanerName || '').trim();
    const firstSpace    = cleanerFull.indexOf(' ');
    const cleaner_first = firstSpace === -1 ? cleanerFull : cleanerFull.slice(0, firstSpace);
    const cleaner_last  = firstSpace === -1 ? ''          : cleanerFull.slice(firstSpace + 1);

    // JotForm auto-generates a PDF of every submission at this URL.
    // Valid while submission exists in JotForm. Long-term: mirror to Supabase Storage.
    const submission_url = submission_id
      ? `https://www.jotform.com/pdf-submission/${submission_id}`
      : null;

    // Room fields can come in as JSON arrays (photo widgets) or plain text.
    // Stringify objects/arrays so the text column accepts them.
    const asText = (v) => {
      if (v == null) return null;
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch { return String(v); }
    };

    const row = {
      submission_id:   String(submission_id),
      submission_date: new Date().toISOString(),
      property_id:     String(property_id),
      property_name:   String(raw.q3_property      || ''),
      plan_type:       String(raw.q38_plan_type    || ''),
      coffee_type:     String(raw.q39_coffee_type  || ''),
      clean_id:        String(raw.q9_clean_id      || ''),
      bedrooms:        Number(raw.q11_beds)   || null,
      bathrooms:       Number(raw.q12_baths)  || null,
      sleeps:          Number(raw.q37_sleeps) || null,

      cleaner_first,
      cleaner_last,
      owner_email:     String(raw.q16_ownerEmail || ''),

      // Room fields - camelCase, no q-prefix on this form. Conditionally rendered
      // by JotForm based on property bed/bath count, so anything absent lands as null.
      bathroom_1:      asText(raw.bathroom1),
      bathroom_2:      asText(raw.bathroom2),
      bathroom_3:      asText(raw.bathroom3),
      bathroom_4:      asText(raw.bathroom4),
      bathroom_5:      asText(raw.bathroom5),
      bedroom_1:       asText(raw.bedroom1),
      bedroom_2:       asText(raw.bedroom2),
      bedroom_3:       asText(raw.bedroom3),
      bedroom_4:       asText(raw.bedroom4),
      bedroom_5:       asText(raw.bedroom5),
      bedroom_6:       asText(raw.bedroom6),
      living_room:     asText(raw.livingRoom),
      kitchen_area:    asText(raw.kitchenArea),
      patio:           asText(raw.patio),

      submission_url,
      processed:       false,
    };

    const { error: insertError } = await supabase
      .from('raw_completed_clean')
      .insert(row);

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(400).json({ error: insertError.message });
    }

    return res.status(200).json({ success: true, submission_url });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
