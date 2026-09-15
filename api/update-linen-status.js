const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Updates status / dates / checkoff state on an existing linen order row.
// Does NOT touch quantities — that's save-linen-order's job.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const propertyId = body.property_id;
    if (!propertyId) {
      return res.status(400).json({ success: false, error: 'Missing property_id' });
    }

    const patch = { property_id: propertyId, updated_at: new Date().toISOString() };

    // Only set fields that were actually provided
    if (body.order_status !== undefined) patch.order_status = body.order_status;
    if (body.order_placed_date !== undefined) patch.order_placed_date = body.order_placed_date || null;
    if (body.order_received_date !== undefined) patch.order_received_date = body.order_received_date || null;
    if (body.initial_load_date !== undefined) patch.initial_load_date = body.initial_load_date || null;
    if (body.checkoff_state !== undefined) patch.checkoff_state = body.checkoff_state;

    const { data, error } = await supabase
      .from('property_linen_inventory')
      .upsert(patch, { onConflict: 'property_id' })
      .select();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
