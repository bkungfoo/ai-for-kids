import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { authenticate } from '../auth/credentials.js';
import { createSession, destroySession, getSession } from '../auth/sessions.js';
import { parseCookies } from '../auth/cookies.js';
import { loginPage } from './loginPage.js';
import { newChallenge, verifyChallenge } from '../auth/captcha.js';
import { registerUser } from '../auth/userStore.js';
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

// Login page (with the create-an-account form). If already signed in, go
// straight to the app. Every render mints a fresh single-use puzzle.
authRouter.get('/login', (req: Request, res: Response) => {
  if (getSession(currentToken(req))) {
    res.redirect('/');
    return;
  }
  res.type('html').send(
    loginPage({
      error: req.query.error === '1',
      registerError: typeof req.query.rerr === 'string' ? req.query.rerr : undefined,
      challenge: newChallenge(),
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
  const { username, password, confirm, captchaId, captchaAnswer } = (req.body ?? {}) as Record<
    string,
    unknown
  >;
  const back = (rerr: string) => res.redirect(`/login?rerr=${rerr}`);

  if (!registrationAllowed(req.ip ?? 'unknown')) return back('slow');
  if (!verifyChallenge(captchaId, captchaAnswer)) return back('puzzle');
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

  const err = registerUser(username, password);
  if (err) return back(err);

  logger.info('account registered', { username });
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

// Sign out.
authRouter.post('/logout', (req: Request, res: Response) => {
  destroySession(currentToken(req));
  res.clearCookie(config.auth.cookieName, { path: '/' });
  res.redirect('/login');
});
