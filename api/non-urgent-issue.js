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

// See urgent-issue.js for why matching is by semantic name, not q{id}_.
function normalizeKey(k) {
  return String(k).replace(/^q\d+_/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function buildMap(raw) {
  const map = {};
  for (const k of Object.keys(raw || {})) {
    const nk = normalizeKey(k);
    if (map[nk] === undefined || map[nk] === '') map[nk] = raw[k];
  }
  return map;
}

function pick(map, candidates) {
  for (const c of candidates) {
    const nc = normalizeKey(c);
    const v = map[nc];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  for (const c of candidates) {
    const nc = normalizeKey(c);
    for (const k of Object.keys(map)) {
      if (k.includes(nc)) {
        const v = map[k];
        if (v !== undefined && v !== null && v !== '') return v;
      }
    }
  }
  return undefined;
}

function asText(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try { return asText(JSON.parse(t)); } catch { return t; }
    }
    return t;
  }
  if (Array.isArray(v)) return v.filter(Boolean).map(asText).join(', ');
  if (typeof v === 'object') return Object.values(v).filter(Boolean).map(asText).join(' ');
  return String(v);
}

function asName(v) {
  let o = v;
  if (typeof o === 'string') {
    const t = o.trim();
    if (t.startsWith('{')) { try { o = JSON.parse(t); } catch { /* keep string */ } }
  }
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    return { first: asText(o.first || o.f || ''), last: asText(o.last || o.l || '') };
  }
  const parts = asText(o).split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}

function asFiles(v) {
  if (v === undefined || v === null || v === '') return [];
  let o = v;
  if (typeof o === 'string') {
    const t = o.trim();
    if (t.startsWith('[')) { try { o = JSON.parse(t); } catch { return [t]; } }
    else return [t];
  }
  if (Array.isArray(o)) return o.map(asText).filter(Boolean);
  return [asText(o)].filter(Boolean);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const fields = await parseMultipart(req);

    let raw = {};
    if (fields.rawRequest) {
      try { raw = JSON.parse(fields.rawRequest); } catch { raw = fields; }
    } else {
      raw = fields;
    }

    console.log('NON-URGENT ISSUE keys:', JSON.stringify(Object.keys(raw)));

    const map    = buildMap(raw);
    const photos = asFiles(pick(map, ['photoUpload', 'fileUpload', 'photo', 'upload']));
    const name   = asName(pick(map, ['cleanerName', 'cleaner', 'name']));

    // The form carries an Urgency field that has no column of its own;
    // fold it into the description rather than dropping it.
    const description = asText(pick(map, ['descriptionOfIssue', 'description', 'details']));
    const urgency     = asText(pick(map, ['urgency', 'priority']));

    const row = {
      submission_id:   String(fields.submissionID || ''),
      submission_date: new Date().toISOString(),
      property_id:     asText(pick(map, ['propertyId', 'propertyID'])) || null,
      property_name:   asText(pick(map, ['property', 'propertyName'])) || null,
      clean_id:        asText(pick(map, ['cleanId', 'cleanID'])) || null,
      issue_type:      asText(pick(map, ['issueType', 'typeOfIssue', 'issue'])) || null,
      description:     (urgency ? `[Urgency: ${urgency}] ${description}` : description) || null,
      photo_1:         photos[0] || null,
      photo_2:         photos[1] || null,
      cleaner_first:   name.first || null,
      cleaner_last:    name.last || null,
      processed:       false,
    };

    const { error: insertError } = await supabase
      .from('raw_non_urgent_issues')
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
