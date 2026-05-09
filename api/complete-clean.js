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

    // Log every key so we can map the q-prefixed fields after first test submission
    console.log('KEYS:', JSON.stringify(Object.keys(raw)));

    const submission_id = fields.submissionID || '';
    const property_id   = raw.q72_property_id || raw.property_id || '';

    if (!property_id) {
      console.log('Missing property_id. Keys:', Object.keys(raw));
      return res.status(400).json({ error: 'Missing property_id' });
    }

    // JotForm auto-generates a PDF of every submission at this URL pattern.
    // Note: only valid while submission exists in JotForm. Long-term we mirror
    // to Supabase Storage — short-term this is fine for early clients.
    const submission_url = submission_id
      ? `https://www.jotform.com/pdf-submission/${submission_id}`
      : null;

    // Helper: rooms can come in as JSON-encoded arrays (photo widgets) or text.
    // Stringify objects/arrays so the text column accepts them; pass strings through.
    const asText = (v) => {
      if (v == null) return null;
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v); } catch { return String(v); }
    };

    const row = {
      submission_id:   String(submission_id),
      submission_date: new Date().toISOString(),
      property_id:     String(property_id),
      property_name:   String(raw.q3_property || raw.property || ''),
      plan_type:       String(raw.q73_plan_type || raw.plan_type || ''),
      coffee_type:     String(raw.q76_coffee_type || raw.coffee_type || ''),
      clean_id:        String(raw.q77_clean_id || raw.clean_id || ''),
      bedrooms:        Number(raw.q4_beds || raw.beds) || null,
      bathrooms:       Number(raw.q5_baths || raw.baths) || null,
      sleeps:          Number(raw.q6_sleeps || raw.sleeps) || null,

      // Cleaner + owner — q-prefixes confirmed after first KEYS log
      cleaner_first:   String(raw.cleaner_first || ''),
      cleaner_last:    String(raw.cleaner_last  || ''),
      owner_email:     String(raw.owner_email   || ''),

      // Room-by-room — q-prefixes confirmed after first KEYS log
      bathroom_1:      asText(raw.bathroom_1),
      bathroom_2:      asText(raw.bathroom_2),
      bathroom_3:      asText(raw.bathroom_3),
      bathroom_4:      asText(raw.bathroom_4),
      bathroom_5:      asText(raw.bathroom_5),
      bedroom_1:       asText(raw.bedroom_1),
      bedroom_2:       asText(raw.bedroom_2),
      bedroom_3:       asText(raw.bedroom_3),
      bedroom_4:       asText(raw.bedroom_4),
      bedroom_5:       asText(raw.bedroom_5),
      bedroom_6:       asText(raw.bedroom_6),
      living_room:     asText(raw.living_room),
      kitchen_area:    asText(raw.kitchen_area),
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
