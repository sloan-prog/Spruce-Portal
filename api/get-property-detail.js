import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { property_id } = req.query;

    if (!property_id) {
      return res.status(400).json({ success: false, error: 'Missing property_id' });
    }

    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('*')
      .eq('property_id', property_id)
      .single();

    if (propertyError) {
      return res.status(400).json({ success: false, error: propertyError.message });
    }

    const { data: cleans } = await supabase
      .from('cleans_normalized')
      .select('clean_date, cleaner_name, status, plan_type, pdf_proof_link, photos_pdf_link')
      .eq('property_id', property_id)
      .order('clean_date', { ascending: false })
      .limit(10);

    const { data: urgentIssues } = await supabase
      .from('urgent_issues')
      .select('date_reported, issue_category, issue_description, status, photo_link')
      .eq('property_id', property_id)
      .order('date_reported', { ascending: false })
      .limit(10);

    const { data: nonUrgentIssues } = await supabase
      .from('non_urgent_issues')
      .select('date_reported, issue_category, description, status, photo_link')
      .eq('property_id', property_id)
      .order('date_reported', { ascending: false })
      .limit(10);

    const { data: laundry } = await supabase
      .from('laundry_jobs')
      .select('requested_pickup_date, pickup_status, bag_count, weight_lbs, cost')
      .eq('property_id', property_id)
      .order('requested_pickup_date', { ascending: false })
      .limit(10);

    const { data: financials } = await supabase
      .from('clean_financials')
      .select('event_date, total_revenue, total_cost, profit, margin')
      .eq('property_id', property_id)
      .order('event_date', { ascending: false })
      .limit(20);

    const totals = (financials || []).reduce((acc, row) => {
      acc.revenue += Number(row.total_revenue || 0);
      acc.cost += Number(row.total_cost || 0);
      acc.profit += Number(row.profit || 0);
      return acc;
    }, { revenue: 0, cost: 0, profit: 0 });

    return res.status(200).json({
      success: true,
      property,
      cleans: cleans || [],
      urgentIssues: urgentIssues || [],
      nonUrgentIssues: nonUrgentIssues || [],
      laundry: laundry || [],
      financials: financials || [],
      totals
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
