const COOKIE_NAME = 'plant_guide_session';
const SESSION_SECONDS = 60 * 24 * 60 * 60;
const encoder = new TextEncoder();

function securityHeaders(contentType = 'text/html; charset=utf-8') {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Content-Type': contentType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret, usages) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

async function sign(value, secret) {
  const key = await hmacKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function createSessionToken(secret, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${await sign(payload, secret)}`;
}

async function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;

  try {
    const key = await hmacKey(secret, ['verify']);
    return crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

async function secureEqual(left, right) {
  const digest = async (value) => new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(String(value))),
  );
  const [leftDigest, rightDigest] = await Promise.all([digest(left), digest(right)]);
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest[index] ^ rightDigest[index];
  }
  return difference === 0;
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function loginPage(nextPath, error = '', status = 200) {
  const message = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : '<p class="intro">Enter the private guide password to continue.</p>';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Private plant guide</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #173b2c; background: #f5f1e8; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 1.25rem; background: radial-gradient(circle at top, #dfead9, #f5f1e8 52%); }
    main { width: min(100%, 26rem); padding: clamp(1.5rem, 6vw, 2.5rem); border: 1px solid #cfd9ce; border-radius: 1.75rem; background: rgba(255,255,252,.96); box-shadow: 0 1.25rem 3rem rgba(23,59,44,.12); }
    .eyebrow { margin: 0 0 .75rem; color: #557262; font-size: .75rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-family: Georgia, serif; font-size: clamp(2.25rem, 10vw, 3.4rem); line-height: .95; letter-spacing: -.04em; }
    .intro, .error { margin: 1.25rem 0; line-height: 1.55; }
    .error { padding: .75rem .9rem; border-radius: .75rem; color: #762f20; background: #fae7df; font-weight: 700; }
    label { display: block; margin-bottom: .45rem; font-size: .8rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    input { width: 100%; min-height: 3.25rem; padding: .8rem 1rem; border: 1px solid #aebcaf; border-radius: .9rem; background: white; color: #173b2c; font: inherit; }
    input:focus { outline: .2rem solid #d8e7d5; border-color: #315e48; }
    button { width: 100%; min-height: 3.25rem; margin-top: 1rem; border: 0; border-radius: .9rem; background: #1e553c; color: white; font: inherit; font-weight: 800; cursor: pointer; }
    button:hover { background: #17452f; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Indoor Plant Care Tracker</p>
    <h1>Private plant guide</h1>
    ${message}
    <form method="post" action="/login">
      <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">Open the guide</button>
    </form>
  </main>
</body>
</html>`;

  return new Response(html, { status, headers: securityHeaders() });
}

function configurationError() {
  return new Response(
    'Plant guide authentication is not configured.',
    { status: 503, headers: securityHeaders('text/plain; charset=utf-8') },
  );
}

function redirectResponse(location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: {
      ...securityHeaders('text/plain; charset=utf-8'),
      Location: location,
      ...headers,
    },
  });
}

export async function middleware(context) {
  const { request, next, env } = context;
  const password = env?.PLANT_GUIDE_PASSWORD;
  const sessionSecret = env?.PLANT_GUIDE_SESSION_SECRET;

  if (
    typeof password !== 'string'
    || password.length < 12
    || typeof sessionSecret !== 'string'
    || sessionSecret.length < 32
  ) return configurationError();

  const url = new URL(request.url);

  if (url.pathname === '/logout') {
    return redirectResponse('/login', {
      'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    });
  }

  if (url.pathname === '/login') {
    const nextPath = safeReturnPath(url.searchParams.get('next'));

    if (request.method === 'GET' || request.method === 'HEAD') {
      return loginPage(nextPath);
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { ...securityHeaders('text/plain; charset=utf-8'), Allow: 'GET, HEAD, POST' },
      });
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return loginPage('/', 'The login request could not be read. Please try again.', 400);
    }

    const submittedPassword = form.get('password');
    const submittedNextPath = safeReturnPath(form.get('next'));
    if (typeof submittedPassword !== 'string' || !(await secureEqual(submittedPassword, password))) {
      return loginPage(submittedNextPath, 'That password did not match.', 401);
    }

    const token = await createSessionToken(sessionSecret);
    return redirectResponse(submittedNextPath, {
      'Set-Cookie': `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
    });
  }

  const token = readCookie(request, COOKIE_NAME);
  if (await verifySessionToken(token, sessionSecret)) return next();

  const returnPath = `${url.pathname}${url.search}`;
  return redirectResponse(`/login?next=${encodeURIComponent(returnPath)}`);
}

export const config = {
  matcher: ['/:path*'],
};
