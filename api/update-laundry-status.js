import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Advances (or sets) a laundry job's pickup_status and stamps the matching
// timestamp column. Called by the admin laundry dashboard.
//
// Allowed statuses map to the laundry_status_enum:
//   PENDING / SCHEDULED  -> "Ready for Pickup"
//   PICKED_UP            -> "Picked Up" (out at vendor)
//   DELIVERED            -> "Returned to Stock"
//   COMPLETE             -> reconciled
//   CANCELED             -> soft-deleted
//
// Body: { laundry_job_id: string, status: string }

const ALLOWED = ['PENDING', 'SCHEDULED', 'PICKED_UP', 'DELIVERED', 'COMPLETE', 'CANCELED'];

// Which timestamp to stamp when a job reaches a given status.
const STAMP = {
  PICKED_UP: 'pickup_actual_at',
  DELIVERED: 'delivery_actual_at'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { laundry_job_id, status } = body;

    if (!laundry_job_id || !status) {
      return res.status(400).json({ success: false, error: 'laundry_job_id and status are required' });
    }
    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${ALLOWED.join(', ')}` });
    }

    const patch = { pickup_status: status, updated_at: new Date().toISOString() };
    if (STAMP[status]) {
      patch[STAMP[status]] = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('laundry_jobs')
      .update(patch)
      .eq('laundry_job_id', laundry_job_id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, job: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
