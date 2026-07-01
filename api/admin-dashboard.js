import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

  const today = new Date().toISOString().split('T')[0];

  // Cleans Today
  const { count: cleansToday } = await supabase
    .from('cleans_normalized')
    .select('*', { count: 'exact', head: true })
    .eq('clean_date', today);

  // Cleans This Week
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const start = startOfWeek.toISOString().split('T')[0];

  const { count: cleansWeek } = await supabase
    .from('cleans_normalized')
    .select('*', { count: 'exact', head: true })
    .gte('clean_date', start);

  // Urgent Issues
  const { count: urgentIssues } = await supabase
    .from('urgent_issues')
    .select('*', { count: 'exact', head: true })
    .not('status', 'is', null);

  // Callouts
  const { count: callouts } = await supabase
    .from('emergency_call_outs')
    .select('*', { count: 'exact', head: true })
    .eq('processed', false);

  // Revenue Today
  const { data: revenueData } = await supabase
    .from('clean_financials')
    .select('total_revenue, profit')
    .eq('event_date', today);

  let revenueToday = 0;
  let netToday = 0;

  revenueData?.forEach(r => {
    revenueToday += Number(r.total_revenue || 0);
    netToday += Number(r.profit || 0);
  });

  // Laundry
  const { count: laundry } = await supabase
    .from('laundry_jobs')
    .select('*', { count: 'exact', head: true })
    .not('pickup_status', 'is', null);

  res.status(200).json({
    cleansToday: cleansToday || 0,
    cleansWeek: cleansWeek || 0,
    urgentIssues: urgentIssues || 0,
    callouts: callouts || 0,
    revenueToday,
    netToday,
    laundry: laundry || 0
  });
}
