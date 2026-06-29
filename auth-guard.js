/* Admin page gate. Added on branch add-admin-auth.
 * Included (after supabase-js and admin-auth.js) by each admin page.
 * Redirects to login.html unless there is a Supabase session whose email is on
 * the allowlist. The page stays hidden (via #auth-gate-style) until cleared.
 */
(function () {
  var A = window.SPRUCE_ADMIN_AUTH;

  function toLogin() {
    var next = encodeURIComponent(location.pathname + location.search);
    location.replace("login.html?next=" + next);
  }

  function reveal() {
    var s = document.getElementById("auth-gate-style");
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  // Fail closed if the library or config didn't load.
  if (!A || !window.supabase || !window.supabase.createClient) {
    toLogin();
    return;
  }

  A.client()
    .auth.getSession()
    .then(function (res) {
      var session = res && res.data ? res.data.session : null;
      var email = session && session.user ? session.user.email : null;
      if (session && A.isAllowed(email)) {
        reveal();
      } else {
        toLogin();
      }
    })
    .catch(toLogin);
})();
