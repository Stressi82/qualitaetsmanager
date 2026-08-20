const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/.netlify/identity')) {
        return identity(request, env, url.pathname.slice('/.netlify/identity'.length) || '/');
      }
      if (url.pathname === '/.netlify/functions/account-access') {
        return accountAccess(request, env);
      }
      if (url.pathname === '/.netlify/functions/account-sync') {
        return accountSync(request, env);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: 'Interner Serverfehler.' }, 500);
    }
  }
};

async function identity(request, env, path) {
  if (request.method === 'GET' && path === '/settings') {
    return json({ autoconfirm: true, disable_signup: false, external: {} });
  }
  if (request.method === 'POST' && path === '/signup') return signup(request, env);
  if (request.method === 'POST' && path === '/token') return token(request, env);
  if (request.method === 'GET' && path === '/user') return getUser(request, env);
  if (request.method === 'PUT' && path === '/user') return updateUser(request, env);
  if (request.method === 'POST' && path === '/logout') return json({});
  if (request.method === 'POST' && path === '/recover') {
    return json({ error: 'Nutze deinen Wiederherstellungscode in der Lernplattform.' }, 501);
  }
  return json({ error: 'Nicht gefunden.' }, 404);
}

async function signup(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!email || password.length < 10) return json({ error: 'E-Mail oder Passwort ist ungültig.' }, 400);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return json({ error: 'A user with this email address has already been registered' }, 422);
  const id = crypto.randomUUID();
  const salt = randomBase64(16);
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id,email,password_hash,password_salt,roles,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, email, passwordHash, salt, '[]', now, now).run();
  return json(userPayload({ id, email, roles: '[]', created_at: now, updated_at: now }));
}

async function token(request, env) {
  const form = new URLSearchParams(await request.text());
  const grant = form.get('grant_type');
  let user;
  if (grant === 'password') {
    const email = normalizeEmail(form.get('username'));
    user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user || !constantTimeEqual(await hashPassword(form.get('password') || '', user.password_salt), user.password_hash)) {
      return json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }, 401);
    }
  } else if (grant === 'refresh_token') {
    const raw = form.get('refresh_token') || '';
    const tokenHash = await sha256(raw);
    const row = await env.DB.prepare('SELECT user_id,expires_at FROM refresh_tokens WHERE token_hash = ?').bind(tokenHash).first();
    if (!row || Number(row.expires_at) < Date.now()) return json({ error: 'invalid_grant' }, 401);
    user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first();
  } else return json({ error: 'unsupported_grant_type' }, 400);
  return json(await issueTokens(user, env));
}

async function getUser(request, env) {
  const user = await authenticatedUser(request, env);
  return user ? json(userPayload(user)) : json({ error: 'unauthorized' }, 401);
}

async function updateUser(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const body = await readJson(request);
  if (body.password) {
    if (String(body.password).length < 10) return json({ error: 'Passwort ist zu kurz.' }, 400);
    const salt = randomBase64(16);
    const hash = await hashPassword(String(body.password), salt);
    await env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?')
      .bind(hash, salt, new Date().toISOString(), user.id).run();
  }
  return json(userPayload(await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first()));
}

async function accountAccess(request, env) {
  if (request.method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405);
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: 'Nicht angemeldet.' }, 401);
  const roles = parseRoles(user.roles);
  if (!roles.includes('member')) roles.push('member');
  await env.DB.prepare('UPDATE users SET roles=?,updated_at=? WHERE id=?')
    .bind(JSON.stringify(roles), new Date().toISOString(), user.id).run();
  return json({ ready: true });
}

async function accountSync(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: 'Nicht angemeldet.' }, 401);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT revision,record_json,updated_at FROM learning_records WHERE user_id=?').bind(user.id).first();
    return json({ record: row ? { ...JSON.parse(row.record_json), revision: Number(row.revision), updatedAt: row.updated_at } : null });
  }
  if (request.method === 'PUT') {
    const body = await readJson(request);
    const current = await env.DB.prepare('SELECT revision FROM learning_records WHERE user_id=?').bind(user.id).first();
    const revision = Number(current?.revision || 0);
    if (Number(body.baseRevision || 0) !== revision) return json({ error: 'Der Lernstand wurde auf einem anderen Gerät geändert.', revision }, 409);
    const next = revision + 1;
    const now = new Date().toISOString();
    const record = body.record || {};
    await env.DB.prepare(`INSERT INTO learning_records (user_id,revision,record_json,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,record_json=excluded.record_json,updated_at=excluded.updated_at`)
      .bind(user.id, next, JSON.stringify(record), now).run();
    return json({ record: { ...record, revision: next, updatedAt: now } });
  }
  return json({ error: 'Methode nicht erlaubt.' }, 405);
}

async function issueTokens(user, env) {
  const now = Math.floor(Date.now() / 1000);
  const access = await signJwt({ sub: user.id, email: user.email, role: 'authenticated', app_metadata: { provider: 'email', roles: parseRoles(user.roles) }, user_metadata: {}, iat: now, exp: now + 3600 }, env.JWT_SECRET);
  const refresh = randomBase64(32);
  await env.DB.prepare('INSERT INTO refresh_tokens (token_hash,user_id,expires_at) VALUES (?,?,?)')
    .bind(await sha256(refresh), user.id, Date.now() + 30 * 86400000).run();
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: refresh };
}

async function authenticatedUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const cookie = request.headers.get('Cookie') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : cookie.match(/(?:^|;\s*)nf_jwt=([^;]+)/)?.[1];
  if (!token) return null;
  const payload = await verifyJwt(decodeURIComponent(token), env.JWT_SECRET);
  return payload?.sub ? env.DB.prepare('SELECT * FROM users WHERE id=?').bind(payload.sub).first() : null;
}

function userPayload(user) {
  return { id: user.id, email: user.email, role: 'authenticated', confirmed_at: user.created_at, created_at: user.created_at, updated_at: user.updated_at, app_metadata: { provider: 'email', roles: parseRoles(user.roles) }, user_metadata: {} };
}

async function signJwt(payload, secret) {
  if (!secret) throw new Error('JWT_SECRET fehlt');
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${header}.${body}.${base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`))))}`;
}

async function verifyJwt(token, secret) {
  try {
    const [header, body, signature] = token.split('.');
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, fromBase64url(signature), encoder.encode(`${header}.${body}`));
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(body)));
    return ok && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}

async function hashPassword(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromBase64(salt), iterations: 310000, hash: 'SHA-256' }, material, 256);
  return base64(new Uint8Array(bits));
}

async function sha256(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0;
}
function parseRoles(value) { try { const roles = JSON.parse(value || '[]'); return Array.isArray(roles) ? roles : []; } catch { return []; } }
function normalizeEmail(value) { const email = String(value || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''; }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }); }
function randomBase64(size) { const bytes = crypto.getRandomValues(new Uint8Array(size)); return base64(bytes); }
function base64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function fromBase64(value) { const s = atob(value); return Uint8Array.from(s, c => c.charCodeAt(0)); }
function base64url(bytes) { return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromBase64url(value) { return fromBase64(value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)); }
