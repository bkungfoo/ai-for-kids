import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { authenticate } from '../auth/credentials.js';
import { createSession, destroySession, getSession } from '../auth/sessions.js';
import { parseCookies } from '../auth/cookies.js';
import { loginPage } from './loginPage.js';
import { registerUser } from '../auth/userStore.js';
import {
  approvalSig,
  approveInvite,
  consumeToken,
  createInvite,
  tokenUsable,
} from '../auth/invites.js';
import { sendEmail } from '../util/alerts.js';
import { guardText } from '../safety/pipeline.js';

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.auth.cookieSecure,
  maxAge: config.auth.sessionTtlMs,
  path: '/',
};

function currentToken(req: Request): string | undefined {
  return parseCookies(req)[config.auth.cookieName];
}

// Login page (with the create-an-account form; account creation needs an
// approved invite token). If already signed in, go straight to the app.
authRouter.get('/login', (req: Request, res: Response) => {
  if (getSession(currentToken(req))) {
    res.redirect('/');
    return;
  }
  res.type('html').send(
    loginPage({
      error: req.query.error === '1',
      registerError: typeof req.query.rerr === 'string' ? req.query.rerr : undefined,
      requested: req.query.requested === '1',
    }),
  );
});

// --- Self-registration -----------------------------------------------------------
// Bot filtering: a single-use server-minted puzzle + a small per-IP rate
// limit. The username is also run through the child-safety moderator so the
// account list stays kid-appropriate.
const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const registerAttempts = new Map<string, { count: number; resetAt: number }>();
function registrationAllowed(ip: string): boolean {
  const now = Date.now();
  const slot = registerAttempts.get(ip);
  if (!slot || slot.resetAt <= now) {
    registerAttempts.set(ip, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
    return true;
  }
  slot.count += 1;
  return slot.count <= REGISTER_LIMIT;
}

authRouter.post('/register', async (req: Request, res: Response) => {
  const { username, password, confirm, inviteToken } = (req.body ?? {}) as Record<string, unknown>;
  const back = (rerr: string) => res.redirect(`/login?rerr=${rerr}`);

  if (!registrationAllowed(req.ip ?? 'unknown')) return back('slow');
  // Approved, unused invite tokens only — checked first (without consuming,
  // so a typo in another field doesn't burn the token).
  if (!tokenUsable(inviteToken)) return back('token');
  if (typeof username !== 'string' || typeof password !== 'string') return back('invalid');
  if (password !== confirm) return back('mismatch');

  // Keep the roster kid-appropriate: the username faces anyone at the login
  // prompt and in operator tooling.
  try {
    // Framed as a username so the moderator judges appropriateness — a bare
    // string gets misread as a child sharing a personal identifier (pii).
    const verdict = await guardText(
      [`Account username chosen for a kids' creative app: "${username}"`],
      'input',
    );
    if (!verdict.allowed) return back('name');
  } catch {
    return back('again');
  }

  const err = registerUser(username, password, 'public');
  if (err) return back(err);
  consumeToken(inviteToken); // burn it only once the account really exists

  logger.info('public-universe account registered', { username });
  const token = createSession(username);
  res.cookie(config.auth.cookieName, token, cookieOptions);
  res.redirect('/');
});

// Handle credential submission (form-encoded).
authRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = (req.body ?? {}) as Record<string, unknown>;
  const matchedUser = authenticate(username, password);
  if (!matchedUser) {
    logger.warn('failed login attempt', {
      username: typeof username === 'string' ? username : '<invalid>',
    });
    res.redirect('/login?error=1');
    return;
  }
  const token = createSession(matchedUser);
  res.cookie(config.auth.cookieName, token, cookieOptions);
  res.redirect('/');
});

// --- Public-universe invites -------------------------------------------------------
// A visitor asks for a token (name, birthday, email); the owner gets an email
// with a signed approval link; approving emails the token back to them.
const inviteAttempts = new Map<string, { count: number; resetAt: number }>();
function inviteAllowed(ip: string): boolean {
  const now = Date.now();
  const slot = inviteAttempts.get(ip);
  if (!slot || slot.resetAt <= now) {
    inviteAttempts.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  slot.count += 1;
  return slot.count <= 3;
}

authRouter.post('/request-token', async (req: Request, res: Response) => {
  const { name, birthday, email } = (req.body ?? {}) as Record<string, unknown>;
  const back = (rerr: string) => res.redirect(`/login?rerr=${rerr}`);
  if (!inviteAllowed(req.ip ?? 'unknown')) return back('slow');
  if (
    typeof name !== 'string' || !name.trim() || name.length > 60 ||
    typeof birthday !== 'string' || !birthday.trim() || birthday.length > 20 ||
    typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120
  ) {
    return back('reqinvalid');
  }
  const invite = createInvite(name.trim(), birthday.trim(), email.trim());
  if (!invite) return back('again');
  const approveUrl = `${config.publicBaseUrl}/approve-invite?id=${invite.id}&sig=${approvalSig(invite.id)}`;
  // The journal always carries the link, so approval works even if email
  // delivery is down or unconfigured.
  logger.info('invite requested', { id: invite.id, email: invite.email, approveUrl });
  try {
    await sendEmail(
      config.alerts.email,
      `Harbor House: account request from ${invite.name}`,
      `Someone asked for a public-universe account:\n\n` +
        `  Name:     ${invite.name}\n  Birthday: ${invite.birthday}\n  Email:    ${invite.email}\n\n` +
        `APPROVE (sends them their token):\n  ${approveUrl}\n\n` +
        `Ignore this email to reject the request.`,
    );
  } catch (err) {
    logger.error('invite request email failed (link is in this journal)', {
      id: invite.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  res.redirect('/login?requested=1');
});

// The owner clicks the signed link from the email.
authRouter.get('/approve-invite', async (req: Request, res: Response) => {
  const invite = approveInvite(req.query.id, req.query.sig);
  if (!invite) {
    res.status(404).type('html').send('<h2>Invite not found or link invalid.</h2>');
    return;
  }
  let mailNote = 'Their token has been emailed to them.';
  try {
    await sendEmail(
      invite.email,
      'Your Harbor House account token',
      `Hi ${invite.name}!\n\nYour account request was approved. Your invite token is:\n\n` +
        `    ${invite.token}\n\n` +
        `Go to ${config.publicBaseUrl}/login, click "Create an account", and enter this ` +
        `token with the username and password you want.\n\nHave fun creating!`,
    );
  } catch (err) {
    mailNote = `Emailing the token FAILED (${err instanceof Error ? err.message : String(err)}) — send it to them yourself: ${invite.token}`;
    logger.error('invite approval email failed', { id: invite.id, token: invite.token });
  }
  res.type('html').send(
    `<div style="font-family:system-ui;max-width:480px;margin:60px auto;text-align:center">` +
      `<h2>✅ Approved: ${invite.name}</h2>` +
      `<p>${mailNote}</p><p style="color:#777">Token: <code>${invite.token}</code></p></div>`,
  );
});

// Sign out.
authRouter.post('/logout', (req: Request, res: Response) => {
  destroySession(currentToken(req));
  res.clearCookie(config.auth.cookieName, { path: '/' });
  res.redirect('/login');
});
