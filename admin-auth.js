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

/* ---------------------------------------------------------------------------
 * Auto-attach the admin session token to same-origin /api/ requests.
 *
 * Every admin page already loads this file, so this one wrapper makes them all
 * send "Authorization: Bearer <token>" on their /api/ calls — no per-page edits.
 * It only touches same-origin /api/ URLs, never cross-origin calls (e.g.
 * Supabase's own requests), and it never overwrites an Authorization header a
 * caller already set. The owner portal and the JotForm forms do NOT load this
 * file, so they are unaffected. If anything goes wrong it falls through to a
 * normal (unauthenticated) fetch rather than breaking the call.
 * ------------------------------------------------------------------------- */
(function () {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  if (window.__spruceFetchPatched) return;
  window.__spruceFetchPatched = true;

  var realFetch = window.fetch.bind(window);

  function isAdminApiUrl(url) {
    if (!url) return false;
    // same-origin /api/ only
    if (url.charAt(0) === "/") return url.indexOf("/api/") === 0;
    if (url.indexOf(location.origin + "/api/") === 0) return true;
    return false;
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (!isAdminApiUrl(url) || !window.SPRUCE_ADMIN_AUTH) {
      return realFetch(input, init);
    }
    return window.SPRUCE_ADMIN_AUTH.client()
      .auth.getSession()
      .then(function (res) {
        var session = res && res.data ? res.data.session : null;
        var token = session && session.access_token ? session.access_token : null;
        if (token) {
          init = init || {};
          var headers = new Headers(
            (init && init.headers) ||
              (typeof input !== "string" && input && input.headers) ||
              {}
          );
          if (!headers.has("Authorization")) {
            headers.set("Authorization", "Bearer " + token);
          }
          init = Object.assign({}, init, { headers: headers });
        }
        return realFetch(input, init);
      })
      .catch(function () {
        return realFetch(input, init);
      });
  };
})();
