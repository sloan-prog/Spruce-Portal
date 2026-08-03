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

// ---------------------------------------------------------------
// Field matching.
//
// JotForm sends keys as q{id}_{fieldName}. Hardcoding those IDs is
// brittle: renaming or re-adding a question changes the ID and the
// handler silently starts writing nulls. Instead we strip the q{id}_
// prefix and match on the semantic name, exact first then substring.
// ---------------------------------------------------------------
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

// JotForm values arrive as strings, JSON strings, arrays, or objects.
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

function toISO(v) {
  const s = asText(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
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

    // Logged so the exact field names are visible in Vercel logs on the
    // first live submission — useful for tightening the mapping later.
    console.log('URGENT ISSUE keys:', JSON.stringify(Object.keys(raw)));

    const map    = buildMap(raw);
    const photos = asFiles(pick(map, ['photoUpload', 'photo', 'fileUpload', 'upload']));
    const name   = asName(pick(map, ['cleanerOrInspectorName', 'cleanerName', 'inspectorName', 'name']));

    const row = {
      submission_id:      String(fields.submissionID || ''),
      submission_date:    new Date().toISOString(),
      property_type:      asText(pick(map, ['isThisProperty', 'propertyType', 'buildingOrHouse', 'separateHouse'])) || null,
      building:           asText(pick(map, ['propertyBuilding', 'building'])) || null,
      unit_number:        asText(pick(map, ['propertyUnitNumber', 'unitNumber', 'unit'])) || null,
      property_address:   asText(pick(map, ['propertyAddress', 'address'])) || null,
      property_city:      asText(pick(map, ['propertyCity', 'city'])) || null,
      issue_type:         asText(pick(map, ['issueType', 'typeOfIssue', 'issue'])) || null,
      description:        asText(pick(map, ['descriptionOfIssue', 'description', 'details'])) || null,
      photo_1:            photos[0] || null,
      photo_2:            photos[1] || null,
      photo_3:            photos[2] || null,
      photo_4:            photos[3] || null,
      issue_date:         toISO(pick(map, ['date', 'issueDate'])),
      cleaner_first:      name.first || null,
      cleaner_last:       name.last || null,
      can_complete_clean: asText(pick(map, ['canYouComplete', 'canCompleteClean', 'completeClean', 'reportIssue'])) || null,
      submission_url:     asText(pick(map, ['submissionUrl'])) || null,
      property_id:        asText(pick(map, ['propertyId', 'propertyID'])) || null,
      clean_id:           asText(pick(map, ['cleanId', 'cleanID'])) || null,
      processed:          false,
    };

    // This form identifies a property by building + unit rather than by ID.
    // Best-effort resolution; left null for downstream normalization on miss.
    if (!row.property_id && (row.unit_number || row.building)) {
      try {
        let q = supabase.from('properties').select('property_id').limit(2);
        if (row.unit_number) q = q.eq('unit_number', row.unit_number);
        if (row.building)    q = q.ilike('building', `%${row.building}%`);
        const { data: matches } = await q;
        if (matches && matches.length === 1) row.property_id = matches[0].property_id;
      } catch (e) {
        console.warn('property resolution skipped:', e.message);
      }
    }

    const { error: insertError } = await supabase
      .from('raw_urgent_issues')
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
