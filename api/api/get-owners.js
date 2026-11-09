import { requireAdmin } from './_lib/requireAdmin.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const { data, error } = await supabase
      .from('owners')
      .select('owner_id, owner_name, owner_email')
      .order('owner_name', { ascending: true });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, owners: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
