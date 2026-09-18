import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // ---- existing operational tiles ----
    const { count: cleansToday } = await supabase
      .from('cleans_normalized').select('*', { count: 'exact', head: true })
      .eq('clean_date', today);

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const start = startOfWeek.toISOString().split('T')[0];

    const { count: cleansWeek } = await supabase
      .from('cleans_normalized').select('*', { count: 'exact', head: true })
      .gte('clean_date', start);

    const { count: urgentIssues } = await supabase
      .from('urgent_issues').select('*', { count: 'exact', head: true })
      .not('status', 'is', null);

    const { count: callouts } = await supabase
      .from('emergency_call_outs').select('*', { count: 'exact', head: true })
      .eq('processed', false);

    const { data: revenueData } = await supabase
      .from('clean_financials').select('total_revenue, profit')
      .eq('event_date', today);
    let revenueToday = 0, netToday = 0;
    revenueData?.forEach(r => {
      revenueToday += Number(r.total_revenue || 0);
      netToday += Number(r.profit || 0);
    });

    const { count: laundry } = await supabase
      .from('laundry_jobs').select('*', { count: 'exact', head: true })
      .not('pickup_status', 'is', null);

    // ---- NEW: property counts by tier ----
    const { data: props } = await supabase
      .from('properties').select('property_id, plan_type');
    const tierCounts = { SIMPLY: 0, SIGNATURE: 0, CERTIFIED: 0 };
    let totalProperties = 0;
    (props || []).forEach(p => {
      totalProperties++;
      if (tierCounts[p.plan_type] !== undefined) tierCounts[p.plan_type]++;
    });

    // ---- NEW: who's low (DRIVER item at/below min_threshold) ----
    const { data: drivers } = await supabase
      .from('item_catalog').select('item_code, item_name')
      .eq('reorder_priority', 'DRIVER');
    const driverCodes = (drivers || []).map(d => d.item_code);
    const driverName = {};
    (drivers || []).forEach(d => { driverName[d.item_code] = d.item_name; });

    let lowList = [];
    if (driverCodes.length) {
      const { data: stock } = await supabase
        .from('property_stock')
        .select('property_id, item_code, current_on_hand, min_threshold, target_par')
        .in('item_code', driverCodes);
      (stock || []).forEach(s => {
        if (s.current_on_hand !== null && s.min_threshold !== null &&
            Number(s.current_on_hand) <= Number(s.min_threshold)) {
          lowList.push({
            property_id: s.property_id,
            item_code: s.item_code,
            item_name: driverName[s.item_code] || s.item_code,
            on_hand: s.current_on_hand,
            min: s.min_threshold,
            par: s.target_par
          });
        }
      });
    }
    const propsNeedingBox = [...new Set(lowList.map(l => l.property_id))];

    // ---- NEW: linens due for refresh (installed > 18 months) ----
    const { data: linens } = await supabase
      .from('property_linen_inventory').select('property_id, initial_load_date');
    const refreshDue = [];
    const now = Date.now();
    (linens || []).forEach(l => {
      if (l.initial_load_date) {
        const months = (now - new Date(l.initial_load_date).getTime()) / (1000*60*60*24*30.44);
        if (months >= 18) refreshDue.push({ property_id: l.property_id, months: Math.round(months) });
      }
    });

    res.status(200).json({
      cleansToday: cleansToday || 0,
      cleansWeek: cleansWeek || 0,
      urgentIssues: urgentIssues || 0,
      callouts: callouts || 0,
      revenueToday, netToday,
      laundry: laundry || 0,
      totalProperties,
      tierCounts,
      lowList,
      propsNeedingBox,
      refreshDue
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
