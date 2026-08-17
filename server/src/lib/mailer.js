'use strict';

const config = require('../config/env');
const logger = require('./logger');

/**
 * Transactional email.
 *
 * Resend when RESEND_API_KEY is set, and otherwise a logged fallback rather
 * than a thrown error: without it, a developer running the stack locally could
 * invite a user and then never reach the link, which would make the whole
 * account flow untestable on any machine that has no mail credentials. The link
 * is printed to the server log instead.
 *
 * That fallback is a development convenience only. In production the key is
 * required at boot (see config/env.js) — an administrator cannot hand over an
 * invitation that went to a log file.
 *
 * Sending is done with fetch rather than the `resend` SDK to keep the
 * serverless bundle small — the API is one POST.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * @returns {Promise<{ delivered: boolean }>} delivered=false means the message
 *   was written to the log instead of being sent — the caller may want to say
 *   so out loud in development.
 */
async function sendMail({ to, subject, html, text }) {
  if (!config.mail.enabled) {
    logger.warn(
      { to, subject, text },
      'RESEND_API_KEY is not set — email not sent, contents logged instead'
    );
    return { delivered: false };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.mail.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: config.mail.from, to: [to], subject, html, text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend rejected the message (${response.status}): ${body}`);
  }

  return { delivered: true };
}

module.exports = { sendMail };
