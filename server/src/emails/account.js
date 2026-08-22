'use strict';

/**
 * Invitation and password-reset emails.
 *
 * The server is the one place that translates (IMPLEMENTATION_PLAN.md §7 rule
 * 6): someone reading their mail is not holding a copy of the front-end, so the
 * code-plus-translation-key arrangement the API uses cannot apply here.
 * Templates are keyed by the recipient's own `locale`.
 */

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const TEMPLATES = {
  INVITATION: {
    fr: {
      subject: 'Votre accès à SIPROCOM SGS',
      heading: 'Bienvenue sur SIPROCOM SGS',
      intro: (name, inviter) =>
        `Bonjour ${name}, ${inviter} vous a créé un compte sur le système de gestion de stock de SIPROCOM.`,
      action: 'Choisissez votre mot de passe pour activer votre accès :',
      button: 'Définir mon mot de passe',
    },
    en: {
      subject: 'Your SIPROCOM SGS account',
      heading: 'Welcome to SIPROCOM SGS',
      intro: (name, inviter) =>
        `Hello ${name}, ${inviter} has created an account for you on SIPROCOM's stock management system.`,
      action: 'Choose your password to activate your access:',
      button: 'Set my password',
    },
  },
  PASSWORD_RESET: {
    fr: {
      subject: 'Réinitialisation de votre mot de passe — SIPROCOM SGS',
      heading: 'Réinitialisation du mot de passe',
      intro: (name) => `Bonjour ${name}, une réinitialisation a été demandée pour votre compte.`,
      action: 'Choisissez un nouveau mot de passe :',
      button: 'Choisir un nouveau mot de passe',
    },
    en: {
      subject: 'Reset your password — SIPROCOM SGS',
      heading: 'Password reset',
      intro: (name) => `Hello ${name}, a password reset was requested for your account.`,
      action: 'Choose a new password:',
      button: 'Choose a new password',
    },
  },
};

const COMMON = {
  fr: {
    fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
    expiry: (hours) => `Ce lien expire dans ${hours} heures et ne peut servir qu'une fois.`,
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié.",
  },
  en: {
    fallback: 'If the button does not work, paste this link into your browser:',
    expiry: (hours) => `This link expires in ${hours} hours and can only be used once.`,
    ignore: 'If you did not expect this, ignore the message — nothing will change.',
  },
};

/**
 * @param {object} params
 * @param {'INVITATION'|'PASSWORD_RESET'} params.type
 * @param {string} params.locale  "fr" | "en" — falls back to French
 * @param {string} params.name    recipient's display name
 * @param {string} [params.inviter] who created the account (INVITATION only)
 * @param {string} params.url     one-time link
 * @param {number} params.expiresInHours
 */
function accountEmail({ type, locale, name, inviter, url, expiresInHours }) {
  const lang = TEMPLATES[type][locale] ? locale : 'fr';
  const t = TEMPLATES[type][lang];
  const c = COMMON[lang];

  const intro = type === 'INVITATION' ? t.intro(name, inviter) : t.intro(name);

  const text = [
    t.heading,
    '',
    intro,
    t.action,
    url,
    '',
    c.expiry(expiresInHours),
    c.ignore,
  ].join('\n');

  const html = `<!doctype html>
<html lang="${lang}">
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <tr><td>
        <h1 style="margin:0 0 4px;font-size:20px;color:#1e3a5f">SIPROCOM SGS</h1>
        <h2 style="margin:24px 0 12px;font-size:17px">${escapeHtml(t.heading)}</h2>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6">${escapeHtml(intro)}</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6">${escapeHtml(t.action)}</p>
        <p style="margin:0 0 24px">
          <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background:#1e3a5f;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">${escapeHtml(t.button)}</a>
        </p>
        <p style="margin:0 0 6px;font-size:12px;color:#64748b">${escapeHtml(c.fallback)}</p>
        <p style="margin:0 0 20px;font-size:12px;color:#64748b;word-break:break-all">${escapeHtml(url)}</p>
        <p style="margin:0;font-size:12px;color:#94a3b8">${escapeHtml(c.expiry(expiresInHours))} ${escapeHtml(c.ignore)}</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject: t.subject, html, text };
}

const CODE_TEMPLATES = {
  fr: {
    subject: (code) => `${code} — votre code SIPROCOM SGS`,
    heading: 'Votre code de vérification',
    intro: 'Saisissez ce code dans la page de création de compte pour activer votre accès :',
    expiry: (minutes) => `Ce code expire dans ${minutes} minutes.`,
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
  },
  en: {
    subject: (code) => `${code} — your SIPROCOM SGS code`,
    heading: 'Your verification code',
    intro: 'Enter this code on the account creation page to activate your access:',
    expiry: (minutes) => `This code expires in ${minutes} minutes.`,
    ignore: 'If you did not request this, ignore the message.',
  },
};

/**
 * The six-digit signup code.
 *
 * The code leads the subject line on purpose: most phones surface it in the
 * notification, so the recipient can type it without opening the message at
 * all — which is the difference between this flow feeling instant and feeling
 * like a chore.
 *
 * @param {object} params
 * @param {string} params.locale "fr" | "en" — falls back to French
 * @param {string} params.code   the six digits, already generated
 * @param {number} params.expiresInMinutes
 */
function signupCodeEmail({ locale, code, expiresInMinutes }) {
  const lang = CODE_TEMPLATES[locale] ? locale : 'fr';
  const t = CODE_TEMPLATES[lang];

  const text = [t.heading, '', t.intro, code, '', t.expiry(expiresInMinutes), t.ignore].join('\n');

  const html = `<!doctype html>
<html lang="${lang}">
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <tr><td>
        <h1 style="margin:0 0 4px;font-size:20px;color:#1e3a5f">SIPROCOM SGS</h1>
        <h2 style="margin:24px 0 12px;font-size:17px">${escapeHtml(t.heading)}</h2>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6">${escapeHtml(t.intro)}</p>
        <p style="margin:0 0 24px;font-size:34px;font-weight:700;letter-spacing:10px;color:#1e3a5f;text-align:center;background:#f1f5f9;border-radius:10px;padding:18px 0">${escapeHtml(code)}</p>
        <p style="margin:0;font-size:12px;color:#94a3b8">${escapeHtml(t.expiry(expiresInMinutes))} ${escapeHtml(t.ignore)}</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject: t.subject(code), html, text };
}

module.exports = { accountEmail, signupCodeEmail };
