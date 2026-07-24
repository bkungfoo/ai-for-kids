import { execFile } from 'node:child_process';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Operator alerting (e.g. "the AI credits ran out"). Delivery order:
 *   1. SMTP submission when ALERT_SMTP_HOST/USER/PASS are configured
 *      (e.g. smtp.gmail.com:465 with a Gmail App Password — GCP blocks
 *      direct port-25 delivery, so a relay credential is required).
 *   2. The local sendmail binary, if present (works once the VM's MTA is
 *      given a smarthost).
 * Every alert is also logged at error level, so the journal always has it.
 * Alerts are rate-limited per key so an outage sends one email, not hundreds.
 */

const ALERT_MIN_INTERVAL_MS = 60 * 60 * 1000; // at most one email/hour per key
const lastSent = new Map<string, number>();

export function sendOperatorAlert(key: string, subject: string, body: string): void {
  // Always visible in the service journal, even with no email path configured.
  logger.error('operator alert', { key, subject, detail: body });

  const now = Date.now();
  const last = lastSent.get(key) ?? 0;
  if (now - last < ALERT_MIN_INTERVAL_MS) return;
  lastSent.set(key, now);

  // Fire-and-forget: alert delivery must never break or delay a child request.
  void deliver(subject, body).catch((err) => {
    logger.error('operator alert email failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

async function deliver(subject: string, body: string): Promise<void> {
  const { email } = config.alerts;
  if (!email) return;
  const text =
    `${body}\n\n— Harbor House gateway (${new Date().toISOString()})\n` +
    'This alert is rate-limited to at most one email per hour per issue.';
  await sendEmail(email, subject, text);
}

/**
 * General one-shot email (used by operator alerts AND the public-universe
 * invite flow). SMTP relay when configured, else the local sendmail binary.
 * Throws on failure — callers decide whether that matters.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const { smtp } = config.alerts;
  if (smtp.host && smtp.user && smtp.pass) {
    await sendViaSmtp(to, subject, body);
    logger.info('email sent via SMTP', { to, subject });
    return;
  }
  await sendViaSendmail(to, subject, body);
  logger.info('email handed to sendmail', { to, subject });
}

function sendViaSendmail(to: string, subject: string, body: string): Promise<void> {
  const message = `To: ${to}\nSubject: ${subject}\n\n${body}\n`;
  return new Promise((resolve, reject) => {
    const child = execFile('/usr/sbin/sendmail', ['-t'], (err) =>
      err ? reject(err) : resolve(),
    );
    child.stdin?.end(message);
  });
}

/**
 * Minimal SMTPS (implicit TLS, e.g. port 465) client — enough to submit one
 * message through an authenticated relay without adding a dependency.
 */
function sendViaSmtp(to: string, subject: string, body: string): Promise<void> {
  const { host, port, user, pass } = config.alerts.smtp;
  const from = user;
  const message = [
    `From: Harbor House <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body.replace(/^\./gm, '..'), // dot-stuffing
    '.',
  ].join('\r\n');

  return new Promise((resolve, reject) => {
    const socket: TLSSocket = tlsConnect({ host, port, servername: host });
    let buffer = '';
    let done = false;
    // (command sent, expected reply code) pairs, driven as replies arrive.
    const steps: Array<[string | null, number]> = [
      [null, 220], // server greeting
      [`EHLO harbor-house`, 250],
      ['AUTH LOGIN', 334],
      [Buffer.from(user).toString('base64'), 334],
      [Buffer.from(pass).toString('base64'), 235],
      [`MAIL FROM:<${from}>`, 250],
      [`RCPT TO:<${to}>`, 250],
      ['DATA', 354],
      [`${message}\r\n`, 250],
      ['QUIT', 221],
    ];
    let step = 0;

    const fail = (why: string) => {
      if (done) return;
      done = true;
      socket.destroy();
      reject(new Error(why));
    };
    socket.setTimeout(15000, () => fail('SMTP timeout'));
    socket.on('error', (e) => fail(`SMTP socket error: ${e.message}`));
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      // A complete reply ends with "NNN " at the start of its final line.
      if (!/^\d{3} [^\r\n]*\r?\n?$/m.test(buffer.split(/\r?\n/).filter(Boolean).at(-1) ?? '')) {
        return;
      }
      const code = Number(buffer.slice(0, 3));
      const expected = steps[step]?.[1];
      buffer = '';
      if (expected !== undefined && code !== expected) {
        return fail(`SMTP step ${step} expected ${expected}, got ${code}`);
      }
      step += 1;
      if (step >= steps.length) {
        done = true;
        socket.end();
        resolve();
        return;
      }
      const next = steps[step]![0];
      if (next !== null) socket.write(`${next}\r\n`);
      else step += 0; // greeting-style steps have no command to send
    });
  });
}
