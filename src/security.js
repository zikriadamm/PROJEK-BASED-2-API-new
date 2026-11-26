const crypto = require('crypto');
const config = require('./config');

// Daftar token yang dicabut saat logout (token -> exp unix seconds)
// shortcut: disimpan di memori untuk single-process lokal/kampus; restart server mereset daftar ini sebelum exp 2 jam habis.
const revokedTokens = new Map();

function pruneRevokedTokens() {
  const now = Math.floor(Date.now() / 1000);
  for (const [tok, exp] of revokedTokens.entries()) {
    if (exp && now >= exp) {
      revokedTokens.delete(tok);
    }
  }
}

// ---------- Password Hashing (Salt Acak + Scrypt) ----------
function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password wajib berupa string tidak kosong.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (
    typeof password !== 'string' ||
    password.length === 0 ||
    typeof storedHash !== 'string' ||
    !storedHash.includes(':')
  ) {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }

  const [salt, originalHashHex] = parts;
  if (!/^[0-9a-f]+$/i.test(originalHashHex) || originalHashHex.length % 2 !== 0) {
    return false;
  }

  const computedBuf = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHashHex, 'hex');
  if (computedBuf.length !== originalBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuf, originalBuf);
}

// ---------- Signed Token (HMAC-SHA256 / HS256) ----------
function base64urlEncode(input) {
  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(typeof input === 'string' ? input : JSON.stringify(input), 'utf-8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str) {
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function generateToken(user, expiresInSeconds = 7200) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
    identifier: user.identifier,
    jti: crypto.randomBytes(8).toString('hex'),
    iat: now,
    exp: now + expiresInSeconds
  };

  const encodedHeader = base64urlEncode(header);
  const encodedPayload = base64urlEncode(payload);
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', config.JWT_SECRET).update(dataToSign).digest();
  const encodedSignature = base64urlEncode(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function revokeToken(token) {
  if (!token || typeof token !== 'string') return false;
  pruneRevokedTokens();
  let exp = Math.floor(Date.now() / 1000) + 7200;
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const parsed = JSON.parse(base64urlDecode(parts[1]));
      if (typeof parsed.exp === 'number') {
        exp = parsed.exp;
      }
    } catch (err) {
      // tetap simpan dengan default TTL
    }
  }
  revokedTokens.set(token, exp);
  return true;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token tidak disertakan atau bukan string.' };
  }

  pruneRevokedTokens();
  if (revokedTokens.has(token)) {
    return { valid: false, error: 'Token telah dicabut (logout). Silakan login kembali.' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Format struktur token tidak valid.' };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = base64urlEncode(
    crypto.createHmac('sha256', config.JWT_SECRET).update(dataToSign).digest()
  );

  const bufExpected = Buffer.from(expectedSig, 'utf-8');
  const bufActual = Buffer.from(encodedSignature, 'utf-8');

  if (bufExpected.length !== bufActual.length || !crypto.timingSafeEqual(bufExpected, bufActual)) {
    return { valid: false, error: 'Tanda tangan digital token tidak valid.' };
  }

  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && now >= payload.exp) {
      return { valid: false, error: 'Token telah kedaluwarsa (expired). Silakan login kembali.' };
    }
    return { valid: true, user: payload };
  } catch (err) {
    return { valid: false, error: 'Payload token gagal diurai.' };
  }
}

// ---------- Pemeriksaan API Key ----------
function verifyApiKey(req) {
  const headers = (req && req.headers) || {};
  const headerKey = headers['x-api-key'] || headers['X-API-KEY'] || headers['x-api_key'];
  if (!headerKey || typeof headerKey !== 'string') {
    return { valid: false, error: 'Header x-api-key wajib disertakan pada seluruh request API.' };
  }

  const expectedBuf = Buffer.from(String(config.API_KEY), 'utf-8');
  const actualBuf = Buffer.from(headerKey, 'utf-8');
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, error: 'Nilai x-api-key tidak valid atau tidak terdaftar.' };
  }

  return { valid: true };
}

// ---------- Ekstraksi Bearer Token & Guard RBAC ----------
function extractBearerToken(req) {
  const headers = (req && req.headers) || {};
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.trim().match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

function requireAuth(req, allowedRoles = []) {
  const token = extractBearerToken(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Header Authorization: Bearer <token> wajib disertakan.'
    };
  }

  const verified = verifyToken(token);
  if (!verified.valid) {
    return {
      ok: false,
      status: 401,
      error: verified.error
    };
  }

  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(verified.user.role)) {
    return {
      ok: false,
      status: 403,
      error: `Akses ditolak. Endpoint ini hanya diizinkan untuk role: ${allowedRoles.join(', ')}.`
    };
  }

  return {
    ok: true,
    user: verified.user,
    token
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  revokeToken,
  verifyApiKey,
  extractBearerToken,
  requireAuth
};
