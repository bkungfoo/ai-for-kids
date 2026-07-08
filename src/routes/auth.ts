import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { verifyCredentials } from '../auth/credentials.js';
import { createSession, destroySession, getSession } from '../auth/sessions.js';
import { parseCookies } from '../auth/cookies.js';
import { loginPage } from './loginPage.js';

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

// Login page. If already signed in, go straight to the app.
authRouter.get('/login', (req: Request, res: Response) => {
  if (getSession(currentToken(req))) {
    res.redirect('/');
    return;
  }
  res.type('html').send(loginPage({ error: req.query.error === '1' }));
});

// Handle credential submission (form-encoded).
authRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = (req.body ?? {}) as Record<string, unknown>;
  if (!verifyCredentials(username, password)) {
    logger.warn('failed login attempt', {
      username: typeof username === 'string' ? username : '<invalid>',
    });
    res.redirect('/login?error=1');
    return;
  }
  const token = createSession(config.auth.username);
  res.cookie(config.auth.cookieName, token, cookieOptions);
  res.redirect('/');
});

// Sign out.
authRouter.post('/logout', (req: Request, res: Response) => {
  destroySession(currentToken(req));
  res.clearCookie(config.auth.cookieName, { path: '/' });
  res.redirect('/login');
});
