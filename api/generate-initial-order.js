import { requireAdmin } from './_lib/requireAdmin.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function num(v, d = 0) { const n = Number(v); return isNaN(n) ? d : n; }

// Generates the initial onboarding order for a property, split into 3 tracks.
// CONSUMABLES (per-turn items), SETUP (trays/vessels + hand pumps), LINENS (via separate linen calc).
// Writes rows to initial_orders. Does NOT touch property_stock — that happens only on "ALL RECEIVED".
export default async function handler(req, res) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const property_id = body.property_id;
    if (!property_id) return res.status(400).json({ success: false, error: 'Missing property_id' });

    // Load property
    const { data: property, error: pErr } = await supabase
      .from('properties').select('*').eq('property_id', property_id).single();
    if (pErr) return res.status(400).json({ success: false, error: pErr.message });

    const parCleans = num(property.par_cleans, 10);
    const bathrooms = num(property.bathrooms, 1);
    const halfBaths = num(property.half_baths, 0);
    const sleeps = num(property.sleeps, 2);
    const isSignature = property.plan_type === 'SIGNATURE' || property.plan_type === 'CERTIFIED';
    const sinks = 1 + bathrooms + halfBaths; // kitchen + full baths + half baths

    // coffee quantities (ground only)
    const coffeeBags = Math.ceil(parCleans * 0.5);
    const sugarPacks = Math.ceil(sleeps * 2.5 * parCleans); // per cup servings
    const creamerPacks = Math.ceil(sleeps * 2.5 * parCleans);

    // catalog names
    const { data: catalog } = await supabase.from('item_catalog').select('item_code,item_name');
    const name = {}; (catalog || []).forEach(c => name[c.item_code] = c.item_name);

    // --- TRACK 1: CONSUMABLES (per-turn decrement items) ---
    const consumables = [
      ['CON-001', Math.ceil((bathrooms * 2 + halfBaths * 1 + 2) * parCleans)], // toilet paper
      ['CON-008', Math.ceil(bathrooms * 2 * parCleans)], // shampoo
      ['CON-009', Math.ceil(bathrooms * 2 * parCleans)], // conditioner
      ['CON-010', Math.ceil(bathrooms * 2 * parCleans)], // body gel
      ['CON-011', Math.ceil(bathrooms * 6 * parCleans)], // makeup wipes
      ['CON-002', Math.ceil(parCleans * 1)], // paper towels
      ['CON-003', 120], // lg trash bags
      ['CON-004', 120], // sm trash bags
      ['CON-005', Math.ceil(parCleans * 1)], // dish liquid
      ['CON-007', Math.ceil(parCleans * 3)], // dish pods
      ['CON-006', Math.ceil(parCleans * 3)], // laundry packs
      ['CON-012', Math.ceil(parCleans * 0.1)], // jet dry
      ['CON-017', coffeeBags], // coffee bags
      ['CON-013', sugarPacks], // sugar
      ['CON-015', creamerPacks], // creamer
      ['MSC-001', Math.ceil(parCleans * 2)], // laundry bags
      ['GFT-002', parCleans], // welcome cards (all tiers)
    ];
    if (isSignature) consumables.push(['GFT-001', parCleans]); // arrival key (Sig/Cert only)

    // --- TRACK 2: SETUP (durables: trays/vessels + hand pumps by sink count, Sig+) ---
    const setup = [
      ['SET-001', 1], // marble coffee tray
      ['SET-002', 1], // coffee station holders/caddies
    ];
    if (isSignature) {
      setup.push(['CON-020', sinks]); // hand soap - one per sink
      setup.push(['CON-021', sinks]); // hand lotion - one per sink
    }

    // Clear any existing DRAFT initial order for this property (regenerate), but NOT if already stocked
    const { data: statusRows } = await supabase
      .from('initial_order_status').select('track,stocked').eq('property_id', property_id);
    const lockedTracks = new Set((statusRows || []).filter(s => s.stocked).map(s => s.track));

    const rows = [];
    const addTrack = (track, items) => {
      if (lockedTracks.has(track)) return; // don't regenerate a stocked/locked track
      items.filter(([, q]) => q > 0).forEach(([code, qty]) =>
        rows.push({ property_id, track, item_code: code, item_name: name[code] || code, qty }));
    };
    addTrack('CONSUMABLES', consumables);
    addTrack('SETUP', setup);
    // LINENS track handled by the existing linen calculator; a status row is created so it shows in the tracker.

    // wipe old non-locked rows for regenerate, then insert fresh
    const tracksToWrite = ['CONSUMABLES', 'SETUP'].filter(t => !lockedTracks.has(t));
    if (tracksToWrite.length) {
      await supabase.from('initial_orders').delete().eq('property_id', property_id).in('track', tracksToWrite);
      if (rows.length) await supabase.from('initial_orders').insert(rows);
      // ensure status rows exist (DRAFT) for these tracks
      for (const t of tracksToWrite) {
        await supabase.from('initial_order_status')
          .upsert({ property_id, track: t, status: 'DRAFT', stocked: false }, { onConflict: 'property_id,track' });
      }
    }
    // ensure a LINENS status row exists too
    await supabase.from('initial_order_status')
      .upsert({ property_id, track: 'LINENS', status: 'DRAFT', stocked: false }, { onConflict: 'property_id,track' });

    return res.status(200).json({ success: true, property_id, item_count: rows.length, tracks: tracksToWrite, locked: [...lockedTracks] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
