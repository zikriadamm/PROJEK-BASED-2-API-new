const storage = require('./storage');
const security = require('./security');
const { kirimJSON, kirimError, bacaBody } = require('./httpHelpers');

const TOKEN_TTL_SECONDS = 7200; // 2 jam

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName,
    identifier: user.identifier,
    email: user.email
  };
}

async function handleAuthRouter(req, res, pathname, method) {
  // 1. POST /v2/auth/login
  if (pathname === '/v2/auth/login') {
    if (method !== 'POST') {
      return kirimError(res, 405, 'Endpoint /v2/auth/login hanya menerima metode POST.');
    }

    const body = await bacaBody(req);
    if (
      !body ||
      typeof body.username !== 'string' ||
      typeof body.password !== 'string' ||
      !body.username.trim() ||
      !body.password
    ) {
      return kirimError(res, 400, 'Field "username" dan "password" wajib diisi.');
    }

    const normalizedUsername = body.username.trim().toLowerCase();
    const users = await storage.getUsers();
    const foundUser = users.find((u) => String(u.username).toLowerCase() === normalizedUsername);

    if (!foundUser || !security.verifyPassword(body.password, foundUser.passwordHash)) {
      return kirimError(res, 401, 'Username atau password tidak valid.');
    }

    const token = security.generateToken(foundUser, TOKEN_TTL_SECONDS);
    return kirimJSON(res, 200, {
      sukses: true,
      pesan: 'Login berhasil.',
      tokenType: 'Bearer',
      token,
      expiresIn: TOKEN_TTL_SECONDS,
      user: sanitizeUser(foundUser)
    });
  }

  // 2. POST /v2/auth/logout
  if (pathname === '/v2/auth/logout') {
    if (method !== 'POST') {
      return kirimError(res, 405, 'Endpoint /v2/auth/logout hanya menerima metode POST.');
    }

    const auth = security.requireAuth(req);
    if (!auth.ok) {
      return kirimError(res, auth.status, auth.error);
    }

    security.revokeToken(auth.token);
    return kirimJSON(res, 200, {
      sukses: true,
      pesan: 'Logout berhasil. Token telah dicabut.'
    });
  }

  // 3. GET /v2/auth/me (cek profil sesi aktif)
  if (pathname === '/v2/auth/me') {
    if (method !== 'GET') {
      return kirimError(res, 405, 'Endpoint /v2/auth/me hanya menerima metode GET.');
    }

    const auth = security.requireAuth(req);
    if (!auth.ok) {
      return kirimError(res, auth.status, auth.error);
    }

    return kirimJSON(res, 200, {
      sukses: true,
      user: {
        id: auth.user.id,
        username: auth.user.username,
        role: auth.user.role,
        fullName: auth.user.fullName,
        identifier: auth.user.identifier
      }
    });
  }

  return kirimError(res, 404, `Endpoint autentikasi ${method} ${pathname} tidak ditemukan.`);
}

module.exports = {
  handleAuthRouter
};
