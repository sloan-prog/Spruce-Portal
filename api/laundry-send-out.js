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

// Match on semantic field name rather than JotForm's q{id}_ prefix,
// so renaming or re-adding a question doesn't silently break the map.
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

function asInt(v) {
  const n = parseInt(asText(v), 10);
  return isNaN(n) ? null : n;
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

    console.log('LAUNDRY SEND OUT keys:', JSON.stringify(Object.keys(raw)));

    const map = buildMap(raw);

    // NOTE: this form carries BOTH property bed configuration (King, Queen,
    // Full, Twin, Sofa) and linen counts (KING SHEETS, QUEEN SHEETS, ...).
    // Candidates below deliberately require "sheets" so the two never collide.
    const row = {
      submission_id:   String(fields.submissionID || ''),
      submission_date: new Date().toISOString(),
      direction:       'SEND_OUT',
      property_id:     asText(pick(map, ['propertyId', 'propertyID'])) || null,
      property_name:   asText(pick(map, ['property', 'propertyName'])) || null,
      clean_id:        asText(pick(map, ['cleanId', 'cleanID'])) || null,
      cleaner_name:    asText(pick(map, ['cleaner', 'cleanerName', 'yourName'])) || null,
      plan_type:       asText(pick(map, ['planType'])) || null,
      bag_count:       asInt(pick(map, ['numberOf', 'numberOfBags', 'bags', 'bagCount'])),
      queen_sheets:    asInt(pick(map, ['queenSheets'])),
      king_sheets:     asInt(pick(map, ['kingSheets'])),
      full_sheets:     asInt(pick(map, ['fullSheets'])),
      twin_sheets:     asInt(pick(map, ['twinSheets'])),
      towels:          asInt(pick(map, ['towels'])),
      notes:           asText(pick(map, ['notes', 'note'])) || null,
      // Full payload retained so nothing submitted is ever lost, even if a
      // question isn't broken out into a typed column above.
      items:           raw,
      processed:       false,
    };

    const { error: insertError } = await supabase
      .from('raw_laundry')
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
