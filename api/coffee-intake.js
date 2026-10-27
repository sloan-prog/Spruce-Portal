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

const LOT_RE = /\bHOTP\d{6}[A-Z]?\b/i;

// Pull the first value across the payload that matches a predicate.
function findValue(obj, pred) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) continue;
    const s = String(v);
    if (pred(k, s)) return s;
  }
  return '';
}

/**
 * Coffee set-out scan webhook (JotForm "Coffee Form").
 * Captures the scanned bag barcode (lot code) and which property it was set out at,
 * logs the raw scan, confirms that lot as the property's live lot, and raises a
 * first-expiry-first-out note if an older lot was still on the shelf.
 *
 * It does NOT change the bag COUNT — that stays with the closet/audit forms (CON-017).
 * This scan is the lot/freshness layer only. Always returns 200 so JotForm won't retry-storm.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let scanId = null;
  try {
    const fields = await parseMultipart(req);
    let raw = {};
    if (fields.rawRequest) { try { raw = JSON.parse(fields.rawRequest); } catch { raw = fields; } }
    else raw = fields;

    const submission_id = fields.submissionID || raw.submissionID || '';

    // barcode / lot: a field literally named barcode/lot, else any HOTP-looking value
    let parsed_lot =
      findValue(raw, (k) => /barcode|lot/i.test(k) && LOT_RE.test(String(raw[k]))) ||
      findValue(raw, (_k, v) => LOT_RE.test(v));
    const m = parsed_lot && parsed_lot.match(LOT_RE);
    parsed_lot = m ? m[0].toUpperCase() : '';

    // property: a *property_id field (prefill), else a property name field
    const parsed_property =
      findValue(raw, (k) => /property_id/i.test(k)) ||
      findValue(raw, (k) => /(^|_)property($|_|name)/i.test(k)) || '';

    // optional bag count
    const bagsStr = findValue(raw, (k) => /bags|count|remaining|on[_ ]?hand|qty/i.test(k) && /^\d+$/.test(String(raw[k]).trim()));
    const parsed_bags = bagsStr ? Number(bagsStr) : null;

    // 1) always log the raw scan
    const { data: scan } = await supabase.from('coffee_scans').insert({
      source: 'jotform', submission_id: String(submission_id),
      raw, parsed_lot: parsed_lot || null, parsed_property: parsed_property || null,
      parsed_bags, status: 'RECEIVED'
    }).select('id').single();
    scanId = scan?.id || null;

    if (!parsed_lot) {
      if (scanId) await supabase.from('coffee_scans').update({ status: 'UNMATCHED', note: 'No HOTP lot code found in payload' }).eq('id', scanId);
      return res.status(200).json({ ok: true, matched: false, reason: 'no lot code' });
    }

    // 2) match the lot (prefer same property if we have one)
    let lotQuery = supabase.from('coffee_lots').select('*').eq('lot_code', parsed_lot);
    if (parsed_property) lotQuery = lotQuery.eq('property_id', parsed_property);
    const { data: lots } = await lotQuery.order('received_date', { ascending: false }).limit(1);
    const lot = (lots || [])[0];

    if (!lot) {
      if (scanId) await supabase.from('coffee_scans').update({ status: 'UNMATCHED', note: 'Lot ' + parsed_lot + ' not found' + (parsed_property ? ' for ' + parsed_property : '') }).eq('id', scanId);
      return res.status(200).json({ ok: true, matched: false, reason: 'lot not found', lot: parsed_lot });
    }

    const property_id = lot.property_id;

    // 3) FEFO check — is an OLDER active lot still on the shelf at this property?
    const { data: older } = await supabase
      .from('coffee_lots')
      .select('lot_code, roast_date')
      .eq('property_id', property_id).eq('status', 'ACTIVE')
      .lt('roast_date', lot.roast_date)
      .order('roast_date', { ascending: true }).limit(1);
    const fefo = (older || [])[0];
    const fefoNote = fefo
      ? 'FEFO: older lot ' + fefo.lot_code + ' (roasted ' + fefo.roast_date + ') still active — should go out first'
      : null;

    // 4) confirm this lot as the property's live lot
    await supabase.from('properties').update({
      coffee_active_lot: lot.lot_code,
      coffee_active_roast: lot.roast_date,
      coffee_expires_on: lot.expires_on,
      coffee_status: 'OK',
      updated_at: new Date().toISOString()
    }).eq('property_id', property_id);

    await supabase.from('coffee_lots').update({ updated_at: new Date().toISOString() })
      .eq('id', lot.id);

    if (scanId) await supabase.from('coffee_scans').update({
      status: 'MATCHED', matched_lot_id: lot.id, parsed_property: property_id,
      note: fefoNote
    }).eq('id', scanId);

    return res.status(200).json({ ok: true, matched: true, lot: lot.lot_code, property_id, fefo_flag: !!fefo, note: fefoNote });

  } catch (err) {
    console.error('coffee-intake error:', err);
    if (scanId) { try { await supabase.from('coffee_scans').update({ status: 'ERROR', note: err.message }).eq('id', scanId); } catch {} }
    return res.status(200).json({ ok: false, error: err.message }); // 200 so JotForm doesn't retry-storm
  }
};
