import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Owner-facing pull notice. Returns any coffee lots flagged to pull for a property,
 * so the owner portal can show a card the owner forwards to their cleaner.
 *   GET /api/coffee-pull-notice?property_id=XXX -> { notices: [{lot_code, roast_date, expires_on, bags_on_hand, message}] }
 *
 * Low-sensitivity data (which coffee bag to remove). Gate by the portal token later if desired.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const property_id = (req.query.property_id || '').toString().trim();
    if (!property_id) return res.status(400).json({ error: 'property_id required' });

    const { data: lots, error } = await supabase
      .from('coffee_lots')
      .select('lot_code, roast_date, expires_on, bags_received, note')
      .eq('property_id', property_id).eq('status', 'PULL_REQUESTED')
      .order('expires_on', { ascending: true });
    if (error) throw error;

    const { data: stock } = await supabase
      .from('property_stock').select('current_on_hand')
      .eq('property_id', property_id).eq('item_code', 'CON-017').maybeSingle();
    const bags_on_hand = Number(stock?.current_on_hand ?? 0);

    const notices = (lots || []).map(l => ({
      lot_code: l.lot_code,
      roast_date: l.roast_date,
      expires_on: l.expires_on,
      bags_on_hand,
      message: 'Please remove coffee lot ' + l.lot_code + ' (roasted ' + l.roast_date +
               ') from the coffee station — it is past its freshness window. A fresh lot is on the way.'
    }));

    return res.status(200).json({ notices });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
