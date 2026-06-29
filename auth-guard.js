/* Admin page gate. Added on branch add-admin-auth.
 * Included (after supabase-js and admin-auth.js) by each admin page.
 * Redirects to login.html unless there is a Supabase session whose email is on
 * the allowlist. The page stays hidden (via #auth-gate-style) until cleared.
 *
 * Sign-out control added on branch add-admin-signout: once a page is revealed,
 * a fixed "Sign out" button is injected that ends the Supabase session and
 * returns to login.html.
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

  function addSignOutButton() {
    if (document.getElementById("spruce-signout-btn")) return;
    var btn = document.createElement("button");
    btn.id = "spruce-signout-btn";
    btn.type = "button";
    btn.textContent = "Sign out";
    btn.style.cssText =
      "position:fixed;top:14px;right:14px;z-index:99999;" +
      "padding:8px 14px;border:0;border-radius:8px;background:#24382f;" +
      "color:#fff;font-weight:bold;font-family:Arial,sans-serif;cursor:pointer;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.15)";
    btn.addEventListener("click", function () {
      btn.disabled = true;
      btn.textContent = "Signing out…";
      A.client()
        .auth.signOut()
        .then(function () { location.replace("login.html"); })
        .catch(function () { location.replace("login.html"); });
    });
    (document.body || document.documentElement).appendChild(btn);
  }

  function onAuthorized() {
    reveal();
    if (document.body) addSignOutButton();
    else document.addEventListener("DOMContentLoaded", addSignOutButton);
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
        onAuthorized();
      } else {
        toLogin();
      }
    })
    .catch(toLogin);
})();
