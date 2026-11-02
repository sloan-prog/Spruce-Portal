import { createClient } from '@supabase/supabase-js';
// When you build Section 1 of the security guide, uncomment these two.
// import { requireAdmin } from './_lib/requireAdmin.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// status enum: READY, SENT, PAID, FAILED, VOID, NEEDS_ACTION
const BUCKET = {
  READY: 'ready', NEEDS_ACTION: 'ready',
  SENT: 'sent',
  PAID: 'paid',
  FAILED: 'issues', VOID: 'issues',
};

export default async function handler(req, res) {
  // const auth = await requireAdmin(req);
  // if (!auth.ok) return res.status(auth.status).json({ success:false, error: auth.error });
  try {
    const { data: rows, error } = await supabase
      .from('invoicing_queue')
      .select('id, invoice_id, owner_name, owner_email, property_name, plan_type, week_start, week_end, invoice_date, total, subtotal, status, stripe_invoice_status, stripe_hosted_invoice_url, payment_link, stripe_last_error, sent_at, paid_at, processed, created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ success: false, error: error.message });

    const items = (rows || []).map(r => ({
      id: r.id,
      invoice_id: r.invoice_id || '',
      owner_name: r.owner_name || '',
      owner_email: r.owner_email || '',
      property_name: r.property_name || '',
      plan_type: r.plan_type || '',
      week_start: r.week_start,
      week_end: r.week_end,
      invoice_date: r.invoice_date,
      total: Number(r.total || 0),
      status: r.status || 'READY',
      bucket: BUCKET[r.status] || 'ready',
      stripe_invoice_status: r.stripe_invoice_status || '',
      stripe_hosted_invoice_url: r.stripe_hosted_invoice_url || '',
      payment_link: r.payment_link || '',
      stripe_last_error: r.stripe_last_error || '',
      sent_at: r.sent_at,
      paid_at: r.paid_at,
      processed: !!r.processed,
    }));

    const buckets = { ready: [], sent: [], paid: [], issues: [] };
    items.forEach(i => buckets[i.bucket].push(i));

    const sum = arr => +arr.reduce((t, x) => t + x.total, 0).toFixed(2);
    const summary = {
      ready:  { count: buckets.ready.length,  total: sum(buckets.ready) },
      sent:   { count: buckets.sent.length,   total: sum(buckets.sent) },
      paid:   { count: buckets.paid.length,   total: sum(buckets.paid) },
      issues: { count: buckets.issues.length, total: sum(buckets.issues) },
    };

    res.status(200).json({ success: true, items, buckets, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
