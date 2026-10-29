import { createClient } from '@supabase/supabase-js';
// When you build Section 1 of the security guide, uncomment the next line + the gate below.
// import { requireAdmin } from './_lib/requireAdmin.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // ---- SECURITY GATE (enable with Section 1 of the build guide) ----
  // const auth = await requireAdmin(req);
  // if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  try {
    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();

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

    // ---- property counts by tier ----
    const { data: props } = await supabase
      .from('properties').select('property_id, plan_type');
    const tierCounts = { SIMPLY: 0, SIGNATURE: 0, CERTIFIED: 0 };
    let totalProperties = 0;
    (props || []).forEach(p => {
      totalProperties++;
      if (tierCounts[p.plan_type] !== undefined) tierCounts[p.plan_type]++;
    });

    // ---- who's low (DRIVER item at/below min_threshold) ----
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

    // ---- linens due for refresh (installed > 18 months) ----
    const { data: linens } = await supabase
      .from('property_linen_inventory').select('property_id, initial_load_date');
    const refreshDue = [];
    (linens || []).forEach(l => {
      if (l.initial_load_date) {
        const months = (now - new Date(l.initial_load_date).getTime()) / (1000*60*60*24*30.44);
        if (months >= 18) refreshDue.push({ property_id: l.property_id, months: Math.round(months) });
      }
    });

    // ---- scent due for refresh (last refreshed > 8 weeks / 56 days) ----
    const { data: scentProps } = await supabase
      .from('properties').select('property_id, scent_last_refreshed').eq('active', true);
    const scentRefreshDue = [];
    (scentProps || []).forEach(p => {
      if (p.scent_last_refreshed) {
        const weeks = (now - new Date(p.scent_last_refreshed).getTime()) / (1000*60*60*24*7);
        if (weeks >= 8) scentRefreshDue.push({ property_id: p.property_id, weeks: Math.round(weeks) });
      }
    });

    // ================= NEW CARD COUNTS =================

    // ---- Onboarding: in the pipeline, pre-live ----
    // onboarding_stage runs LEAD -> ... -> LIVE; anything not LIVE is still in flight.
    const { data: onbRows } = await supabase
      .from('property_onboarding_submissions').select('onboarding_stage');
    const onboardingActive = (onbRows || [])
      .filter(o => (o.onboarding_stage || 'LEAD') !== 'LIVE').length;

    // ---- Invoices: pending to send (not yet processed/sent) ----
    const { count: invoicesPending } = await supabase
      .from('invoicing_queue').select('*', { count: 'exact', head: true })
      .eq('processed', false);

    // ---- Owners: directory count ----
    const { count: ownersCount } = await supabase
      .from('owners').select('*', { count: 'exact', head: true });

    // ---- Atelier (warehouse) low — for the Tasks feed only ----
    const { data: wh } = await supabase
      .from('warehouse_stock')
      .select('item_code, item_name, units_on_hand, reorder_point, current_season_par, warehouse_par, vendor');
    const atelierLow = (wh || []).filter(w =>
      Number(w.reorder_point) > 0 && Number(w.units_on_hand) <= Number(w.reorder_point));

    // ================= TASKS FOR TODAY (aggregated, no drill) =================
    const tasksToday = [];
    propsNeedingBox.forEach(pid =>
      tasksToday.push({ kind: 'restock', text: pid + ' — due for a supply box' }));
    atelierLow.forEach(w =>
      tasksToday.push({ kind: 'atelier', text: 'Atelier low: ' + (w.item_name || w.item_code) + ' — order from ' + (w.vendor || 'vendor') }));
    (scentRefreshDue || []).forEach(s =>
      tasksToday.push({ kind: 'scent', text: s.property_id + ' — scent refresh due (' + s.weeks + ' wks)' }));
    (refreshDue || []).forEach(r =>
      tasksToday.push({ kind: 'linens', text: r.property_id + ' — linens due for refresh (' + r.months + ' mo)' }));
    if ((invoicesPending || 0) > 0)
      tasksToday.push({ kind: 'invoice', text: invoicesPending + ' invoice(s) pending to send' });
    if ((callouts || 0) > 0)
      tasksToday.push({ kind: 'callout', text: callouts + ' emergency call-out(s) to process' });
    if ((urgentIssues || 0) > 0)
      tasksToday.push({ kind: 'urgent', text: urgentIssues + ' urgent issue(s) open' });

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
      refreshDue,
      scentRefreshDue,
      // new:
      onboardingActive,
      invoicesPending: invoicesPending || 0,
      ownersCount: ownersCount || 0,
      atelierLow: atelierLow.length,
      tasksToday
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
