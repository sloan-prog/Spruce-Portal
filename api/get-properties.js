import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select(`
        property_id,
        property_name,
        building,
        plan_type,
        owner_id,
        owners ( owner_name )
      `)
      .order('property_name', { ascending: true });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, properties: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
