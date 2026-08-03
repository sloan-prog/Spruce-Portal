const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Scheduled processor. Runs every 15 minutes via Vercel Cron (see vercel.json).
 *
 * Calls, in order:
 *   1. process_raw_intake()      — issues + laundry (laundry delegated to
 *                                  process_raw_laundry internally)
 *   2. process_completed_clean() — the clean loop -> invoicing + payroll.
 *                                  Not installed until migration 0004 is merged;
 *                                  its absence is reported, not treated as failure.
 *
 * Both are idempotent — they only touch rows where processed is not true — so a
 * missed run costs nothing and a double run is harmless.
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when that env var is
 * set on the project. Set it. Without it this endpoint is publicly callable.
 */
module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if ((req.headers.authorization || '') !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    console.warn('CRON_SECRET is not set — /api/process-intake is unprotected.');
  }

  const results = {};
  const errors  = {};

  // 1. intake normalization (issues + laundry)
  try {
    const { data, error } = await supabase.rpc('process_raw_intake');
    if (error) throw error;
    results.intake = data;
  } catch (e) {
    errors.intake = e.message;
  }

  // 2. clean loop -> invoicing + payroll (present only after 0004 merges)
  try {
    const { data, error } = await supabase.rpc('process_completed_clean', {});
    if (error) {
      if (/does not exist|could not find|schema cache/i.test(error.message)) {
        results.clean_loop = 'not installed — merge migration 0004 to enable';
      } else {
        throw error;
      }
    } else {
      results.clean_loop = data;
    }
  } catch (e) {
    errors.clean_loop = e.message;
  }

  const ok      = Object.keys(errors).length === 0;
  const payload = { ok, ran_at: new Date().toISOString(), results, errors };

  // Surfaces in Vercel logs; the one place to look if rows stop normalizing.
  console.log('CRON process-intake', JSON.stringify(payload));

  // 207 on partial failure so a monitor can distinguish it from a clean run.
  return res.status(ok ? 200 : 207).json(payload);
};
