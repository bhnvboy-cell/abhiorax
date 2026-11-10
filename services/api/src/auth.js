const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'abhiorax-local-dev-jwt-secret-change-me';
const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      role: user.role,
      iat: now,
      exp: now + ACCESS_TTL_SEC,
      jti: crypto.randomUUID(),
    }),
  );
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifyAccessToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

module.exports = {
  REFRESH_TTL_MS,
  USERNAME_RE,
  EMAIL_RE,
  PASSWORD_RE,
  isUuid,
  sha256,
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
};
