/** The login page HTML. Intentionally has NO sign-up button or link. */
export function loginPage({ error = false }: { error?: boolean } = {}): string {
  const errorBanner = error
    ? '<p class="error" role="alert">Sorry, that username or password didn\'t match. Try again.</p>'
    : '';

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
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <div class="mark" aria-hidden="true">⚓</div>
      <h1>Harbor House</h1>
      <p>Sign in to start creating</p>
    </div>
    ${errorBanner}
    <form method="post" action="/login" autocomplete="off">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" required autofocus />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required />
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}
