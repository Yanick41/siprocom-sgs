'use strict';

/**
 * Proves email delivery works, before it matters.
 *
 *   node scripts/test-email.js votre.adresse@exemple.com
 *
 * Invitations and password resets are the only way into an account (BR-11), so
 * a mail misconfiguration is not a cosmetic problem — it locks people out. The
 * failure is also easy to miss: the API answers 201 whether or not the message
 * left, because an account must not be rolled back by a provider outage.
 *
 * The two mistakes this catches, both of which return a bare 403 from Resend:
 *   - MAIL_FROM on a domain that is not verified with the provider
 *   - sending to anyone other than the account owner while still on a test key
 */

const config = require('../src/config/env');
const { sendMail } = require('../src/lib/mailer');

async function main() {
  const to = process.argv[2];

  if (!to) {
    console.log(`
Send a test email

  node scripts/test-email.js votre.adresse@exemple.com

Checks the whole path: key, sender domain, recipient.
`);
    return;
  }

  console.log(`
  Key      : ${config.mail.enabled ? 'present' : 'MISSING — nothing will be sent'}
  From     : ${config.mail.from}
  To       : ${to}
  App URL  : ${config.appUrl}   (this is what links in emails point at)
`);

  if (!config.mail.enabled) {
    console.log(
      '  RESEND_API_KEY is empty in server/.env, so the message would only be\n' +
        '  written to the log. Paste the key and run this again.\n'
    );
    process.exitCode = 1;
    return;
  }

  const { delivered } = await sendMail({
    to,
    subject: 'Test SIPROCOM SGS',
    text: 'Si vous lisez ceci, la configuration email fonctionne.',
    html:
      '<p style="font-family:system-ui,sans-serif">Si vous lisez ceci, la configuration ' +
      'email de <strong>SIPROCOM SGS</strong> fonctionne.</p>',
  });

  console.log(
    delivered
      ? '  Accepted by the provider. Check the inbox — and the spam folder.\n'
      : '  Not sent.\n'
  );
}

main().catch((error) => {
  console.error(`\n  Failed: ${error.message}\n`);

  if (/403|domain|not verified/i.test(error.message)) {
    console.error(
      '  That is almost always the sender address. Resend refuses any MAIL_FROM\n' +
        '  on a domain you have not verified.\n\n' +
        '  For testing, use the address Resend provides for exactly this:\n' +
        '    MAIL_FROM="SIPROCOM SGS <onboarding@resend.dev>"\n' +
        '  It delivers only to the address that owns the Resend account.\n\n' +
        '  For production, verify siprocom.com (or whichever domain you send from)\n' +
        '  in the Resend dashboard and point MAIL_FROM at it.\n'
    );
  }

  process.exitCode = 1;
});
