import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const owner = {
      owner_id: body.owner_id,
      owner_name: body.owner_name,
      owner_email: body.owner_email,
      owner_phone: body.owner_phone || null,
      preferred_contact_method: body.preferred_contact_method || null,
      billing_email: body.billing_email || body.owner_email,
      owner_status: body.owner_status || 'ONBOARDING',
      autopay_enabled: false,
      notes: body.notes || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('owners')
      .insert([owner])
      .select();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
