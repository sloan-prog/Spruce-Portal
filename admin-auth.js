/* Shared admin auth config + helpers.
 * Added on branch add-admin-auth. Loaded by the admin pages and login.html.
 * Client-side only; uses the Supabase publishable (anon) key, which is safe to
 * expose in the browser. Does not touch anything under api/.
 */
window.SPRUCE_ADMIN_AUTH = {
  SUPABASE_URL: "https://meushwuvdmxymrvoizsl.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_FmtWjqbyfMBf8yIOddBh4Q_5RMjnNgm",

  // Approved admin emails (compared case-insensitively). Add entries to grant
  // access; remove to revoke.
  ALLOWLIST: ["sloanvalencino@gmail.com"],

  client: function () {
    if (this._client) return this._client;
    this._client = window.supabase.createClient(
      this.SUPABASE_URL,
      this.SUPABASE_PUBLISHABLE_KEY
    );
    return this._client;
  },

  isAllowed: function (email) {
    if (!email) return false;
    return this.ALLOWLIST.indexOf(String(email).toLowerCase()) !== -1;
  },
};
