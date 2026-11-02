import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Update an onboarding record's stage or a flag/baseline field.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const id = body.id;
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' });

    const patch = {};
    if (body.stage !== undefined) patch.onboarding_stage = body.stage;
    if (body.fee_paid !== undefined) patch.onboarding_fee_paid = body.fee_paid;
    if (body.contract_signed !== undefined) patch.contract_signed = body.contract_signed;
    if (body.contract_signed_date !== undefined) patch.contract_signed_date = body.contract_signed_date || null;
    if (body.locked_closet !== undefined) patch.locked_closet_confirmed = body.locked_closet;
    if (body.baseline_adr !== undefined) patch.baseline_adr = body.baseline_adr || null;
    if (body.baseline_occupancy !== undefined) patch.baseline_occupancy = body.baseline_occupancy || null;
    if (body.baseline_review_score !== undefined) patch.baseline_review_score = body.baseline_review_score || null;
    if (body.baseline_captured_date !== undefined) patch.baseline_captured_date = body.baseline_captured_date || null;
    if (body.vellum_live_date !== undefined) patch.vellum_live_date = body.vellum_live_date || null;

    const { data, error } = await supabase
      .from('property_onboarding_submissions')
      .update(patch).eq('id', id).select();

    if (error) return res.status(400).json({ success: false, error: error.message });
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
