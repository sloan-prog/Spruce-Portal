import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Read-only. Returns every laundry job with a display-friendly property name and
// a normalised shape, plus the total cost across all jobs.
export default async function handler(req, res) {
  try {
    const { data: jobs, error } = await supabase
      .from('laundry_jobs')
      .select('*')
      .order('requested_pickup_date', { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Map property_id -> property_name (avoids depending on a FK embed).
    const { data: props } = await supabase
      .from('properties')
      .select('property_id, property_name');

    const nameById = {};
    (props || []).forEach(p => { nameById[p.property_id] = p.property_name; });

    const rows = (jobs || []).map(j => ({
      property_id: j.property_id || null,
      property_name: nameById[j.property_id] || j.property_id || '',
      requested_pickup_date: j.requested_pickup_date || null,
      status: j.pickup_status || null,
      bag_count: j.bag_count != null ? j.bag_count : null,
      weight_lbs: j.weight_lbs != null ? j.weight_lbs : null,
      cost: j.cost != null ? j.cost : null,
      // Vendor column name is uncertain; read a few likely keys defensively.
      vendor: j.vendor || j.vendor_name || j.laundry_vendor || null
    }));

    const totalCost = rows.reduce((sum, r) => sum + Number(r.cost || 0), 0);

    return res.status(200).json({
      success: true,
      jobs: rows,
      total_cost: Math.round(totalCost * 100) / 100
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
