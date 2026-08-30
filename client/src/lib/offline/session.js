/**
 * The last identity the server confirmed, kept so a reload with no network
 * does not look like a sign-out.
 *
 * The session itself is an httpOnly cookie that JavaScript cannot read, so
 * /auth/me is the only way to learn who is signed in. Offline that request
 * fails, and the app concluded "nobody" and bounced the user to the login
 * screen - where they could not sign in either, because that needs the server
 * too. Offline mode was unusable for the one situation it exists for.
 *
 * What is stored is a name, an email and a role. Not a credential: the cookie
 * still authorises every request and the server still decides. This only
 * answers "who was here", so the interface can carry on rendering.
 *
 * Cleared on sign-out and on any 401, so a withdrawn session cannot leave a
 * ghost behind.
 */

const KEY = 'sgs:last-user';

export function rememberUser(user) {
  if (!user) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role, locale: user.locale })
    );
  } catch {
    // Private mode, or storage disabled. The app works online regardless;
    // only the offline reload loses its identity.
  }
}

export function readRememberedUser() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    // A stored blob missing a role would sail past `can()` as undefined and
    // render an interface nobody is entitled to. Treat it as absent.
    return user && user.id && user.role ? user : null;
  } catch {
    return null;
  }
}

export function forgetUser() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
