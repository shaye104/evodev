const encoder = new TextEncoder();

function nowIso() {
  return new Date().toISOString();
}

function randomId(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len)
    .toUpperCase();
}

function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function redirect(url, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: url },
  });
}

async function hmacSign(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(sig));
}

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return decoded;
}

async function encodeSession(secret, payload) {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

async function decodeSession(secret, token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = await hmacSign(secret, body);
  if (sig !== expected) return null;
  try {
    const json = base64UrlDecode(body);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const parts = cookie.split(';').map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return '';
}

function setCookie(name, value, options = {}) {
  const opts = {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
    ...options,
  };
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge) cookie += `; Max-Age=${opts.maxAge}`;
  if (opts.path) cookie += `; Path=${opts.path}`;
  if (opts.httpOnly) cookie += '; HttpOnly';
  if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
  if (opts.secure) cookie += '; Secure';
  return cookie;
}

function clearCookie(name) {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure`;
}

async function parseFormData(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return null;
  }
  return request.formData();
}

function requireEnv(env, key) {
  const value = env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

export {
  nowIso,
  randomId,
  jsonResponse,
  redirect,
  encodeSession,
  decodeSession,
  getCookie,
  setCookie,
  clearCookie,
  parseFormData,
  requireEnv,
};
