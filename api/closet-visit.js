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

// Helpers for checkbox-with-max-1 fields (sent as arrays from JotForm)
function isYes(val) {
  if (val == null) return false;
  if (Array.isArray(val)) {
    return val.some(v => String(v).trim().toUpperCase() === 'YES');
  }
  return String(val).trim().toUpperCase() === 'YES';
}

function isNo(val) {
  if (val == null) return false;
  if (Array.isArray(val)) {
    return val.some(v => String(v).trim().toUpperCase() === 'NO');
  }
  return String(val).trim().toUpperCase() === 'NO';
}

function toInt(val) {
  if (val == null || val === '') return 0;
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// =====================================================================
// ITEM MAPPING TABLE
// Maps each item to its JotForm field unique names + the SKU code
// in item_catalog. Add new SKUs by adding rows here.
// =====================================================================
const ITEM_MAP = [
  // Bathroom
  { code: 'CON-001', name: 'toilet_tissue',
    assumed: 'q5_toiletissueAssumed',  actual: 'q79_toiletTissue79',
    variance: 'q78_toilettissueVariance',
    stockUp: 'q6_StockUptoilettissue', leaveOverage: 'q88_leaveToilettissue' },

  { code: 'CON-004', name: 'sm_trash_bags',
    assumed: 'q96_smtrashAssumed',     actual: 'q97_smtrashActual',
    variance: 'q98_smtrashVariance',
    stockUp: 'q101_stockUpsmtrash',    leaveOverage: 'q95_leaveSmtrash' },

  { code: 'CON-008', name: 'shampoo',
    assumed: 'q103_shampooAssumed',    actual: 'q104_shampooActual',
    variance: 'q105_shampooVariance',
    stockUp: 'q108_stockUpshampoo',    leaveOverage: 'q109_leaveShampoo' },

  { code: 'CON-009', name: 'conditioner',
    assumed: 'q110_conditionerAssumed', actual: 'q111_conditionerActual',
    variance: 'q112_conditionerVariance',
    stockUp: 'q115_stockUpConditioner', leaveOverage: 'q116_leaveConditioner' },

  { code: 'CON-010', name: 'soap',
    assumed: 'q117_soapAssumed',       actual: 'q118_soapActual',
    variance: 'q119_soapVariance',
    stockUp: 'q122_stockUpsoap',       leaveOverage: 'q123_leaveSoap' },

  { code: 'CON-011', name: 'makeup_wipes',
    assumed: 'q124_makeupwipesAssumed', actual: 'q125_makeupwipesActual',
    variance: 'q126_makeupwipesVariance',
    stockUp: 'q129_stockUpmakeupwipes', leaveOverage: 'q130_leaveMakeupwipes' },

  // Kitchen
  { code: 'CON-002', name: 'paper_towels',
    assumed: 'q138_papertowelsAssumed', actual: 'q139_papertowelsActual',
    variance: 'q140_paperTowels140',
    stockUp: 'q143_stockUppapertowels', leaveOverage: 'q144_leavePapertowels' },

  { code: 'CON-003', name: 'lg_trash_bags',
    assumed: 'q146_lgtrashassumed',    actual: 'q147_lgtrashActual',
    variance: 'q148_lgtrashVariance',
    stockUp: 'q151_stockUplgtrash',    leaveOverage: 'q152_leaveLgtrash' },

  { code: 'CON-005', name: 'dish_liquid',
    assumed: 'q154_dishliquidAssumed', actual: 'q155_dishliquidActual',
    variance: 'q156_dishliquidVariance',
    stockUp: 'q159_stockUpdishliquid', leaveOverage: 'q160_leaveDishliquid' },

  { code: 'CON-007', name: 'dish_pods',
    assumed: 'q162_dishpodsAssumed',   actual: 'q163_dishpodsActual',
    variance: 'q164_dishpodVariance',
    stockUp: 'q167_stockUpdishpods',   leaveOverage: 'q168_leaveDishpod' },

  { code: 'CON-006', name: 'laundry_packs',
    assumed: 'q170_laundrypacksAssumed', actual: 'q171_laundrypacksActual',
    variance: 'q172_laundryPacks172',
    stockUp: 'q175_stockUpLaundrypacks', leaveOverage: 'q176_leaveLaundrypacks' },

  // Coffee
  { code: 'CON-016', name: 'coffee_pods',
    assumed: 'q178_coffeepodsAssumed', actual: 'q179_coffeepodsActual',
    variance: 'q180_coffeepodsVariance',
    stockUp: 'q183_stockUpcoffeepods', leaveOverage: 'q184_leaveCoffeepods' },

  { code: 'CON-017', name: 'coffee_bags',
    assumed: 'q186_coffeebagsAssumed', actual: 'q187_coffeebagsActual',
    variance: 'q188_coffeebagsVariance',
    stockUp: 'q191_stockUpcoffeebags', leaveOverage: 'q192_leaveCoffeebags' },

  { code: 'CON-013', name: 'sugar',
    assumed: 'q194_sugarpacksAssumed', actual: 'q195_sugarpacksActual',
    variance: 'q196_sugarpacksVariance',
    stockUp: 'q199_stockUpsugarpacks', leaveOverage: 'q200_leaveSugarpacks' },

  // Creamer (note: actual/amount fields labeled with sugarPacks prefix in form,
  // but they're in the creamer section. Wire names as-is.)
  { code: 'CON-015', name: 'creamer',
    assumed: 'q251_creamerPacks',      actual: 'q252_sugarPacks252',
    variance: 'q253_creamerpackVariance',
    stockUp: 'q256_stockUpcreamerpacks', leaveOverage: 'q257_leaveCreamerpacks' },

  { code: 'CON-014', name: 'stirrers',
    assumed: 'q218_stirrersAssumed',   actual: 'q219_stirrersActual',
    variance: 'q220_stirrersVariance',
    stockUp: 'q223_stockUpstirrers',   leaveOverage: 'q224_leaveStirrers' },

  // Arrival gift
  { code: 'GFT-001', name: 'arrival_gift',
    assumed: 'q226_arrivalgiftAssumed', actual: 'q227_arrivalgiftActual',
    variance: 'q228_arrivalgiftVariance',
    stockUp: 'q231_stockUparrivalgift', leaveOverage: 'q232_leaveArrivalgift' },
];

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
    const property_id = raw.q4_propertyid || '';
    const property_name = raw.q65_propertyname || '';
    const runner_last = raw.q40_confirmPick || '';

    if (!property_id) {
      console.log('Missing property_id. Keys:', Object.keys(raw));
      return res.status(400).json({ error: 'Missing property_id' });
    }

    console.log(`Processing closet visit for ${property_id} (${property_name})`);

    // -----------------------------------------------------------------
    // 1. Build archive row for raw_closet_visit
    // -----------------------------------------------------------------
    const archiveRow = {
      submission_id: String(submission_id),
      submission_date: new Date().toISOString(),
      property_id: String(property_id),
      property_name: String(property_name),
      plan_type: String(raw.q71_plantype || ''),
      bedrooms: toInt(raw.q83_bedrooms) || null,
      bathrooms: toInt(raw.q84_typeA84) || null,
      sleeps: toInt(raw.q85_typeA85) || null,
      coffee_type: String(raw.q73_coffeetype || ''),
      runner_last: String(runner_last),
      visit_type: 'RESTOCK',
      processed: false,
    };

    // Pre-populate archive with audit/system values (restock filled below)
    for (const item of ITEM_MAP) {
      if (!item.assumed) continue;
      archiveRow[`${item.name}_system`] = toInt(raw[item.assumed]);
      archiveRow[`${item.name}_audit`] = toInt(raw[item.actual]);
      archiveRow[`${item.name}_restock`] = 0;
    }

    // -----------------------------------------------------------------
    // 2. Per-item decision logic + stock updates
    // -----------------------------------------------------------------
    const adjustmentsToLog = [];

    for (const item of ITEM_MAP) {
      if (!item.assumed) continue;

      const assumed = toInt(raw[item.assumed]);
      const actual = toInt(raw[item.actual]);
      const variance = actual - assumed;
      const stockUpRaw = raw[item.stockUp];

      let truck_pull = 0;
      let final_qty = actual;

      if (variance < 0 && isYes(stockUpRaw)) {
        truck_pull = Math.abs(variance);
        final_qty = actual + truck_pull;
      } else if (variance < 0 && isNo(stockUpRaw)) {
        truck_pull = 0;
        final_qty = actual;
      } else if (variance === 0) {
        truck_pull = 0;
        final_qty = actual;
      } else if (variance > 0) {
        truck_pull = 0;
        final_qty = actual;
      }

      archiveRow[`${item.name}_restock`] = truck_pull;

      // Read current property_stock state for snapshot
      const { data: stockRow } = await supabase
        .from('property_stock')
        .select('current_on_hand')
        .eq('property_id', property_id)
        .eq('item_code', item.code)
        .single();

      const current_before = stockRow?.current_on_hand ?? null;

      if (current_before === null) {
        console.log(`Skipping ${item.code} — no row in property_stock for ${property_id}`);
        continue;
      }

      // Update property_stock to final_qty
      const { error: updateErr } = await supabase
        .from('property_stock')
        .update({
          current_on_hand: final_qty,
          last_updated: new Date().toISOString(),
          last_count_at: new Date().toISOString(),
        })
        .eq('property_id', property_id)
        .eq('item_code', item.code);

      if (updateErr) {
        console.error(`Failed to update property_stock for ${item.code}:`, updateErr);
        continue;
      }

      // Log COUNT_ADJUSTMENT if actual differs from what system had
      if (actual !== current_before) {
        adjustmentsToLog.push({
          property_id,
          item_code: item.code,
          location_type: 'PROPERTY',
          qty_change: actual - current_before,
          qty_before: current_before,
          qty_after: actual,
          reason_code: 'COUNT_ADJUSTMENT',
          reference_id: String(submission_id),
          reference_table: 'raw_closet_visit',
          note: `Audit at ${property_id}: assumed ${assumed}, actual ${actual}, variance ${variance}`,
          created_by: 'WEBHOOK',
        });
      }

      // Log RESTOCK + WAREHOUSE_PICK if truck pull happened
      if (truck_pull > 0) {
        adjustmentsToLog.push({
          property_id,
          item_code: item.code,
          location_type: 'PROPERTY',
          qty_change: truck_pull,
          qty_before: actual,
          qty_after: final_qty,
          reason_code: 'RESTOCK_DELIVERY',
          reference_id: String(submission_id),
          reference_table: 'raw_closet_visit',
          note: `Runner pulled ${truck_pull} from truck for ${property_id}`,
          created_by: 'WEBHOOK',
        });

        // Decrement warehouse_stock
        const { data: whRow } = await supabase
          .from('warehouse_stock')
          .select('units_on_hand')
          .eq('item_code', item.code)
          .single();

        if (whRow) {
          const wh_before = whRow.units_on_hand;
          const wh_after = Math.max(0, wh_before - truck_pull);

          await supabase
            .from('warehouse_stock')
            .update({
              units_on_hand: wh_after,
              updated_at: new Date().toISOString(),
            })
            .eq('item_code', item.code);

          adjustmentsToLog.push({
            property_id: null,
            item_code: item.code,
            location_type: 'WAREHOUSE',
            qty_change: -truck_pull,
            qty_before: wh_before,
            qty_after: wh_after,
            reason_code: 'WAREHOUSE_PICK',
            reference_id: String(submission_id),
            reference_table: 'raw_closet_visit',
            note: `Pulled to truck for ${property_id}`,
            created_by: 'WEBHOOK',
          });
        }
      }
    }

    // -----------------------------------------------------------------
    // 3. Batch insert all stock_adjustments
    // -----------------------------------------------------------------
    if (adjustmentsToLog.length > 0) {
      const { error: adjErr } = await supabase
        .from('stock_adjustments')
        .insert(adjustmentsToLog);
      if (adjErr) {
        console.error('Failed to insert stock_adjustments:', adjErr);
      }
    }

    // -----------------------------------------------------------------
    // 4. Insert archive row
    // -----------------------------------------------------------------
    const { error: archiveErr } = await supabase
      .from('raw_closet_visit')
      .insert(archiveRow);
    if (archiveErr) {
      console.error('Failed to insert raw_closet_visit:', archiveErr);
      return res.status(400).json({ error: archiveErr.message });
    }

    console.log(`Closet visit complete: ${adjustmentsToLog.length} adjustments logged`);

    return res.status(200).json({
      success: true,
      property_id,
      adjustments_logged: adjustmentsToLog.length,
    });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
