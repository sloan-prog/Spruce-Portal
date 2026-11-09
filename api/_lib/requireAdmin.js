/* Server-side admin gate for /api/ endpoints.
 * CommonJS so BOTH ESM endpoints (import { requireAdmin }) and CommonJS
 * endpoints (const { requireAdmin } = require('./_lib/requireAdmin')) can load it.
 * Verifies the caller's Supabase JWT and checks the email allowlist.
 */
const { createClient } = require('@supabase/supabase-js');

const ALLOWLIST = (process.env.ADMIN_ALLOWLIST || 'sloanvalencino@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return { ok: false, status: 401, error: 'Not signed in' };

  const { data, error } = await admin.auth.getUser(token);
  const email = data && data.user && data.user.email ? data.user.email.toLowerCase() : null;
  if (error || !email) return { ok: false, status: 401, error: 'Invalid session' };
  if (!ALLOWLIST.includes(email)) return { ok: false, status: 403, error: 'Not authorized' };

  return { ok: true, email };
}

module.exports = { requireAdmin };
