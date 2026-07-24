/** The login page HTML: sign-in, token-gated create-an-account, and the
 * request-a-token form (public-universe invites). */
export function loginPage({
  error = false,
  registerError,
  requested = false,
}: {
  error?: boolean;
  registerError?: string;
  requested?: boolean;
} = {}): string {
  const errorBanner = error
    ? '<p class="error" role="alert">Sorry, that username or password didn\'t match. Try again.</p>'
    : '';
  const REGISTER_ERRORS: Record<string, string> = {
    token: 'That token isn\'t valid (or was already used). Check the email we sent you!',
    reqinvalid: 'Please fill in your name, birthday, and a real email address.',
    mismatch: 'The two passwords didn\'t match.',
    invalid: 'Usernames are 3–20 letters, numbers, or underscores.',
    weak: 'Passwords need at least 8 characters.',
    taken: 'That username is already taken — pick another!',
    name: 'Let\'s pick a friendlier username.',
    full: 'No more room for new accounts — ask a grown-up.',
    slow: 'Lots of tries just now — wait a bit and try again.',
    again: 'Something went wrong — please try again.',
  };
  const registerBanner = registerError
    ? `<p class="error" role="alert">${REGISTER_ERRORS[registerError] ?? REGISTER_ERRORS.again}</p>`
    : '';
  const requestedBanner = requested
    ? '<p class="okmsg" role="status">📨 Request sent! When it\'s approved, your token arrives by email.</p>'
    : '';
  const showRegister = Boolean(registerError) && registerError !== 'reqinvalid';
  const showRequest = registerError === 'reqinvalid' || requested;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Harbor House — Sign in</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(160deg, #1e3a5f 0%, #2c6e8f 60%, #3d9bb5 100%);
      color: #102a36;
    }
    .card {
      width: min(92vw, 380px); background: #fff; border-radius: 16px;
      padding: 32px 28px; box-shadow: 0 18px 40px rgba(16, 42, 54, 0.35);
    }
    .brand { text-align: center; margin-bottom: 22px; }
    .brand .mark { font-size: 38px; }
    .brand h1 { margin: 6px 0 2px; font-size: 22px; }
    .brand p { margin: 0; color: #5a7785; font-size: 14px; }
    label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
    input {
      width: 100%; padding: 11px 12px; font-size: 15px;
      border: 1px solid #c4d3da; border-radius: 9px; outline: none;
    }
    input:focus { border-color: #2c6e8f; box-shadow: 0 0 0 3px rgba(44,110,143,.18); }
    button {
      width: 100%; margin-top: 22px; padding: 12px; font-size: 15px; font-weight: 600;
      color: #fff; background: #2c6e8f; border: none; border-radius: 9px; cursor: pointer;
    }
    button:hover { background: #245d79; }
    .error {
      margin: 0 0 4px; padding: 10px 12px; font-size: 13px;
      color: #8a1c1c; background: #fde8e8; border-radius: 9px;
    }
    .swap { margin: 16px 0 0; text-align: center; font-size: 13.5px; color: #5a7785; }
    .swap a { color: #2c6e8f; font-weight: 700; }
    .puzzle { margin-top: 16px; padding: 12px 14px; background: #fdf6df;
      border: 1px dashed #d9c37a; border-radius: 10px; }
    .puzzle-q { display: block; font-size: 14px; font-weight: 600; color: #6d5518; }
    .hint { margin: 10px 0 0; font-size: 12.5px; color: #5a7785; }
    .hint a { color: #2c6e8f; font-weight: 700; }
    .okmsg { margin: 0 0 4px; padding: 10px 12px; font-size: 13px;
      color: #1d5c3f; background: #e2f4ea; border-radius: 9px; }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <div class="mark" aria-hidden="true">⚓</div>
      <h1>Harbor House</h1>
      <p>Sign in to start creating</p>
    </div>
    <div id="login-pane" ${showRegister ? 'hidden' : ''}>
      ${errorBanner}
      <form method="post" action="/login" autocomplete="off">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" required ${showRegister ? '' : 'autofocus'} />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Sign in</button>
      </form>
      <p class="swap">New here? <a href="#" id="show-register">Create an account</a></p>
    </div>
    <div id="register-pane" ${showRegister ? '' : 'hidden'}>
      ${registerError !== 'reqinvalid' ? registerBanner : ''}
      <form method="post" action="/register" autocomplete="off">
        <label for="r-username">Pick a username</label>
        <input id="r-username" name="username" type="text" required minlength="3" maxlength="20"
          pattern="[A-Za-z0-9_]+" title="Letters, numbers, and underscores" ${showRegister ? 'autofocus' : ''} />
        <label for="r-password">Pick a password (8+ characters)</label>
        <input id="r-password" name="password" type="password" required minlength="8" />
        <label for="r-confirm">Type the password again</label>
        <input id="r-confirm" name="confirm" type="password" required minlength="8" />
        <div class="puzzle">
          <label for="r-token">Invite token (from your approval email)</label>
          <input id="r-token" name="inviteToken" type="text" required
            placeholder="HH-XXXX-XXXX" style="text-transform:uppercase" />
          <p class="hint">No token yet? <a href="#" id="show-request">Ask for one here</a>.</p>
        </div>
        <button type="submit">Create my account</button>
      </form>
      <p class="swap">Already have one? <a href="#" id="show-login">Sign in</a></p>
    </div>
    <div id="request-pane" ${showRequest ? '' : 'hidden'}>
      ${requestedBanner}
      ${registerError === 'reqinvalid' ? registerBanner : ''}
      <p class="hint" style="margin-top:0">Tell us who you are — the owner approves requests and your
        token arrives by email.</p>
      <form method="post" action="/request-token" autocomplete="off">
        <label for="q-name">Your name</label>
        <input id="q-name" name="name" type="text" required maxlength="60" />
        <label for="q-birthday">Your birthday</label>
        <input id="q-birthday" name="birthday" type="date" required />
        <label for="q-email">Your email</label>
        <input id="q-email" name="email" type="email" required maxlength="120" />
        <button type="submit">📨 Request a token</button>
      </form>
      <p class="swap">Got your token? <a href="#" id="show-register2">Create your account</a> ·
        <a href="#" id="show-login2">Sign in</a></p>
    </div>
  </main>
  <script>
    document.getElementById('show-register').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-pane').hidden = true;
      document.getElementById('register-pane').hidden = false;
      document.getElementById('r-username').focus();
    });
    document.getElementById('show-login').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-pane').hidden = true;
      document.getElementById('login-pane').hidden = false;
      document.getElementById('username').focus();
    });
    const panes = ['login-pane', 'register-pane', 'request-pane'];
    function showPane(id) {
      for (const p of panes) document.getElementById(p).hidden = p !== id;
    }
    document.getElementById('show-request').addEventListener('click', (e) => {
      e.preventDefault(); showPane('request-pane'); document.getElementById('q-name').focus();
    });
    document.getElementById('show-register2').addEventListener('click', (e) => {
      e.preventDefault(); showPane('register-pane'); document.getElementById('r-username').focus();
    });
    document.getElementById('show-login2').addEventListener('click', (e) => {
      e.preventDefault(); showPane('login-pane'); document.getElementById('username').focus();
    });
  </script>
</body>
</html>`;
}
