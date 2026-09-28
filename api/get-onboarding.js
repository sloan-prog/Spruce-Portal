import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Read-only: returns onboarding submissions shaped for the pipeline tracker.
export default async function handler(req, res) {
  try {
    const { data: rows, error } = await supabase
      .from('property_onboarding_submissions')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (error) return res.status(400).json({ success: false, error: error.message });

    const STAGES = ['LEAD','PROPOSAL_SENT','FEE_PAID','CONTRACT_SIGNED','BASELINE_CAPTURED','AUDIT_PASSED','SUPPLIES_LOADED','LIVE'];

    const items = (rows || []).map(r => ({
      id: r.id,
      owner_name: r.owner_name || '',
      property_name: r.property_name || r.building || '(unnamed)',
      plan_type: r.plan_type || '',
      market_id: r.market_id || '',
      stage: r.onboarding_stage || 'LEAD',
      fee_paid: r.onboarding_fee_paid || false,
      contract_signed: r.contract_signed || false,
      locked_closet: r.locked_closet_confirmed || false,
      baseline_adr: r.baseline_adr,
      baseline_captured: r.baseline_captured_date,
      vellum_live_date: r.vellum_live_date,
      created_property_id: r.created_property_id,
      submitted_at: r.submitted_at,
    }));

    // counts by stage for the summary strip
    const counts = {};
    STAGES.forEach(s => counts[s] = 0);
    items.forEach(i => { if (counts[i.stage] !== undefined) counts[i.stage]++; });

    res.status(200).json({ success: true, items, counts, stages: STAGES });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
