import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Soft-deactivate only. Flips a property between ACTIVE and INACTIVE by updating
// the existing row's status enum. It never deletes a property, and rejects any
// status other than ACTIVE / INACTIVE.
const ALLOWED = ['ACTIVE', 'INACTIVE'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const propertyId = body.property_id;
    const status = body.status;

    if (!propertyId) {
      return res.status(400).json({ success: false, error: 'Missing property_id' });
    }
    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status (ACTIVE or INACTIVE only)' });
    }

    const { data, error } = await supabase
      .from('properties')
      .update({
        status: status,
        active: status === 'ACTIVE',
        updated_at: new Date().toISOString()
      })
      .eq('property_id', propertyId)
      .select();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
