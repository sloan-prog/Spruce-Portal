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

// Helper: pull a numeric value trying several possible field-name keys.
function pick(raw, keys) {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') {
      const n = Number(raw[k]);
      if (!isNaN(n)) return n;
    }
  }
  return null; // null = not provided (don't overwrite)
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const fields = await parseMultipart(req);
    let raw = {};
    if (fields.rawRequest) { try { raw = JSON.parse(fields.rawRequest); } catch { raw = fields; } }
    else { raw = fields; }

    // LOG the full raw payload so we can confirm/correct field IDs from the first test.
    console.log('AUDIT RAW:', JSON.stringify(raw));

    const submission_id = fields.submissionID || '';
    // property_id may arrive under a few possible keys — try them
    const property_id = String(
      raw.q72_property_id || raw.property_id || ''
    );

    // Map audit COUNT fields -> item_code. Each value is the PHYSICAL COUNT that will
    // OVERWRITE current_on_hand. We try multiple likely field keys per item since this
    // is a new form; the console log lets us lock the exact keys after the first test.
    const counts = {
      'CON-001': pick(raw, ['q78_toiletTissue78']),     // toilet tissue
      'CON-002': pick(raw, ['q100_paperTowels100']),    // paper towels
      'CON-011': pick(raw, ['q82_makeupWipes82']),      // makeup wipes
      'CON-006': pick(raw, ['q104_laundryPacks104']),   // laundry packs
      'CON-005': pick(raw, ['q102_dishLiquid102']),     // dish liquid
      'CON-007': pick(raw, ['q103_dishPods103']),       // dish pods
      'CON-008': pick(raw, ['q83_shampoo']),            // shampoo
      'CON-009': pick(raw, ['q80_conditioner']),        // conditioner
      'CON-010': pick(raw, ['q81_soap']),               // soap
      'CON-017': pick(raw, ['q108_coffeeBags108']),     // coffee bags (ground)
      'GFT-001': pick(raw, ['q155_arrivalGift']),       // arrival gift (copper key)
    };

    // 1) Log the audit to closet_audit (best-effort; skip fields the table lacks)
    const auditRow = {
      audit_id: String(submission_id),
      audit_date: new Date().toISOString().split('T')[0],
      property_id,
      property_name: String(raw.q3_property || ''),
      toilet_tissue: counts['CON-001'],
      paper_towels: counts['CON-002'],
      makeup_wipes: counts['CON-011'],
      laundry_packs: counts['CON-006'],
      dish_liquid: counts['CON-005'],
      dish_pods: counts['CON-007'],
      shampoo: counts['CON-008'],
      conditioner: counts['CON-009'],
      soap: counts['CON-010'],
      coffee_bags: counts['CON-017'],
      arrival_gift: counts['GFT-001'],
      audited_by: String(raw.q_lastName || raw.yourLastName || ''),
    };
    const { error: logErr } = await supabase.from('closet_audit').insert(auditRow);
    if (logErr) console.error('closet_audit insert error (non-fatal):', logErr.message);

    // 2) OVERWRITE property_stock.current_on_hand with each counted value (the reset).
    if (property_id) {
      for (const [item_code, qty] of Object.entries(counts)) {
        if (qty === null) continue; // not provided -> don't touch it

        // read current for audit trail
        const { data: cur } = await supabase
          .from('property_stock')
          .select('current_on_hand')
          .eq('property_id', property_id).eq('item_code', item_code)
          .maybeSingle();

        if (!cur) continue; // no stock row for this item at this property -> skip
        const before = Number(cur.current_on_hand ?? 0);

        // HARD SET to the physical count
        await supabase.from('property_stock')
          .update({ current_on_hand: qty })
          .eq('property_id', property_id).eq('item_code', item_code);

        // audit trail: an OVERWRITE (not a decrement)
        await supabase.from('stock_adjustments').insert({
          property_id, item_code, location_type: 'PROPERTY',
          qty_change: qty - before, qty_before: before, qty_after: qty,
          reason_code: 'AUDIT_OVERWRITE',
          note: 'Physical audit count (overwrite to truth)', created_by: 'cleaner'
        });
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Audit handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
