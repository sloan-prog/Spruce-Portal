import { createClient } from '@supabase/supabase-js';
// When you build Section 1 of the security guide, uncomment these two.
// import { requireAdmin } from './_lib/requireAdmin.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TERM_MONTHS = 6; // contract term; auto-renew

// next renewal from a signed date: roll forward in TERM_MONTHS steps until it's in the future
function nextRenewal(signed) {
  if (!signed) return null;
  const d = new Date(signed + 'T00:00:00');
  if (isNaN(d)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  while (d <= now) { d.setMonth(d.getMonth() + TERM_MONTHS); }
  return d;
}
function daysBetween(future) {
  if (!future) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((future.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function handler(req, res) {
  // const auth = await requireAdmin(req);
  // if (!auth.ok) return res.status(auth.status).json({ success:false, error: auth.error });
  try {
    const [{ data: owners }, { data: props }, { data: onb }] = await Promise.all([
      supabase.from('owners').select(
        'owner_id, owner_name, owner_email, owner_phone, billing_email, owner_status, autopay_enabled, stripe_customer_id, portal_link, created_at'),
      supabase.from('properties').select('property_id, property_name, plan_type, owner_id, active, status'),
      supabase.from('property_onboarding_submissions').select('owner_id, created_property_id, property_name, contract_signed_date, onboarding_stage'),
    ]);

    // contract date lookup: by created property id first, then owner+property name
    const dateByProp = {};
    const dateByOwnerName = {};
    (onb || []).forEach(o => {
      if (o.contract_signed_date) {
        if (o.created_property_id) dateByProp[o.created_property_id] = o.contract_signed_date;
        if (o.owner_id && o.property_name) dateByOwnerName[o.owner_id + '|' + o.property_name] = o.contract_signed_date;
      }
    });

    const propsByOwner = {};
    (props || []).forEach(p => {
      const signed = dateByProp[p.property_id] || dateByOwnerName[(p.owner_id || '') + '|' + (p.property_name || '')] || null;
      const renew = nextRenewal(signed);
      const days = daysBetween(renew);
      const leaf = {
        property_id: p.property_id,
        property_name: p.property_name || p.property_id,
        plan_type: p.plan_type || '',
        active: p.active,
        status: p.status || '',
        contract_signed_date: signed,
        renewal_date: renew ? renew.toISOString().split('T')[0] : null,
        days_to_renewal: days,
        renewal_tier: days == null ? 'none' : (days <= 30 ? 'urgent' : (days <= 60 ? 'soon' : 'ok')),
      };
      (propsByOwner[p.owner_id] = propsByOwner[p.owner_id] || []).push(leaf);
    });

    const items = (owners || []).map(o => {
      const list = propsByOwner[o.owner_id] || [];
      // soonest upcoming renewal across this owner's properties
      let soonest = null;
      list.forEach(l => { if (l.days_to_renewal != null && (soonest == null || l.days_to_renewal < soonest)) soonest = l.days_to_renewal; });
      return {
        owner_id: o.owner_id,
        owner_name: o.owner_name || '(unnamed)',
        owner_email: o.owner_email || '',
        owner_phone: o.owner_phone || '',
        billing_email: o.billing_email || '',
        owner_status: o.owner_status || '',
        autopay_enabled: !!o.autopay_enabled,
        on_stripe: !!o.stripe_customer_id,
        portal_link: o.portal_link || '',
        property_count: list.length,
        properties: list,
        soonest_renewal_days: soonest,
      };
    });

    // sort: owners with a renewal inside 60d first (soonest first), then everyone else by name
    items.sort((a, b) => {
      const ar = a.soonest_renewal_days, br = b.soonest_renewal_days;
      const aFlag = ar != null && ar <= 60, bFlag = br != null && br <= 60;
      if (aFlag !== bFlag) return aFlag ? -1 : 1;
      if (aFlag && bFlag) return ar - br;
      return a.owner_name.localeCompare(b.owner_name);
    });

    res.status(200).json({
      success: true,
      count: items.length,
      term_months: TERM_MONTHS,
      items,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
