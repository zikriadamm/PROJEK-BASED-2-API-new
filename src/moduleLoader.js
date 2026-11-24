const fs = require('fs');
const path = require('path');
const { kirimError } = require('./httpHelpers');

// Safe module loader agar 4 branch anggota dapat berjalan & diuji mandiri tanpa merge conflict.
// Begitu anggota membuat file modulnya pada branch sendiri, server otomatis mengaktifkannya.

function tryLoad(moduleName) {
  const fullPath = path.join(__dirname, `${moduleName}.js`);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return require(fullPath);
}

const FALLBACK_RATES = {
  USD: 1,
  IDR: 16250,
  JPY: 108.5,
  EUR: 0.92,
  SGD: 1.34,
  MYR: 4.70,
  GBP: 0.78,
  AUD: 1.52
};

const securityFallback = {
  hashPassword() {
    throw new Error('Modul src/security.js belum diimplementasikan (branch feat/security-graphql-web).');
  },
  verifyPassword() {
    throw new Error('Modul src/security.js belum diimplementasikan (branch feat/security-graphql-web).');
  },
  generateToken() {
    throw new Error('Modul src/security.js belum diimplementasikan (branch feat/security-graphql-web).');
  },
  verifyApiKey() {
    return { valid: true, mode: 'fallback' };
  },
  extractBearerToken(req) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    return parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;
  },
  verifyToken() {
    return {
      valid: true,
      mode: 'fallback',
      user: {
        id: 1,
        username: 'dev-fallback',
        role: 'admin',
        fullName: 'Dev Fallback Admin (src/security.js belum aktif)',
        identifier: 'DEV-FALLBACK'
      }
    };
  },
  requireAuth(req, allowedRoles = []) {
    const token = this.extractBearerToken(req);
    const verified = this.verifyToken(token);
    if (!verified.valid) {
      return { ok: false, status: 401, error: verified.error };
    }
    if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(verified.user.role)) {
      return { ok: false, status: 403, error: 'Akses ditolak untuk peran Anda.' };
    }
    return { ok: true, user: verified.user, mode: 'fallback' };
  }
};

const publicApisFallback = {
  async getLiveRates() {
    return {
      rates: { ...FALLBACK_RATES },
      sumber: 'fallback_stub',
      status: 'FALLBACK_STUB',
      terakhirDiperbarui: 'stub-offline (src/publicApis.js belum aktif)'
    };
  },
  konversiKeIDR(amount, currency, rates = FALLBACK_RATES) {
    const cur = (currency || 'IDR').toUpperCase();
    if (cur === 'IDR') {
      const val = Math.round(amount);
      return {
        nominalIDR: val,
        kursPerSatuanIDR: 1,
        formatRupiah: 'Rp ' + val.toLocaleString('id-ID'),
        keterangan: 'Mata uang lokal (IDR)'
      };
    }
    const rateAsal = rates[cur] || FALLBACK_RATES[cur] || 1;
    const rateIDR = rates.IDR || FALLBACK_RATES.IDR;
    const nilaiDalamIDR = Math.round((amount / rateAsal) * rateIDR);
    const kursSatuSatuanIDR = Math.round((1 / rateAsal) * rateIDR);
    return {
      nominalIDR: nilaiDalamIDR,
      kursPerSatuanIDR: kursSatuSatuanIDR,
      formatRupiah: 'Rp ' + nilaiDalamIDR.toLocaleString('id-ID'),
      keterangan: `1 ${cur} ≈ Rp ${kursSatuSatuanIDR.toLocaleString('id-ID')} (fallback stub)`
    };
  },
  async getWeatherForecast(lat = -0.836, lon = 119.893) {
    return {
      temperature: 31.5,
      temperatureFormatted: '31.5°C',
      windSpeed: 10.2,
      windSpeedFormatted: '10.2 km/h',
      weatherCode: 1,
      condition: 'Cerah Berawan',
      latitude: lat,
      longitude: lon,
      sumber: 'fallback_stub',
      status: 'FALLBACK_STUB',
      waktuAmbil: 'stub-offline (src/publicApis.js belum aktif)'
    };
  }
};

function createNotImplementedRouter(fileName, owner, branch) {
  return async function handleNotImplemented(req, res) {
    return kirimError(
      res,
      501,
      `Modul ${fileName} belum diimplementasikan di branch ini.`,
      {
        file: fileName,
        owner,
        branch,
        petunjuk: `Implementasikan ${fileName} pada branch ${branch} sesuai panduan di docs/tasks/.`
      }
    );
  };
}

let cached = null;

function loadFeatureModules() {
  if (cached) return cached;

  const loadedSecurity = tryLoad('security');
  const loadedAuthRouter = tryLoad('authRouter');
  const loadedPublicApis = tryLoad('publicApis');
  const loadedV1Router = tryLoad('v1Router');
  const loadedV2Router = tryLoad('v2Router');
  const loadedGraphqlSchema = tryLoad('graphqlSchema');

  // Lengkapi requireAuth secara otomatis jika src/security.js tidak mengekspornya sendiri
  const security = loadedSecurity
    ? {
        ...loadedSecurity,
        requireAuth:
          typeof loadedSecurity.requireAuth === 'function'
            ? loadedSecurity.requireAuth.bind(loadedSecurity)
            : (req, allowedRoles = []) => {
                const token = loadedSecurity.extractBearerToken(req);
                if (!token) {
                  return {
                    ok: false,
                    status: 401,
                    error: 'Header Authorization: Bearer <token> wajib disertakan.'
                  };
                }
                const verified = loadedSecurity.verifyToken(token);
                if (!verified.valid) {
                  return { ok: false, status: 401, error: verified.error };
                }
                if (
                  Array.isArray(allowedRoles) &&
                  allowedRoles.length > 0 &&
                  !allowedRoles.includes(verified.user.role)
                ) {
                  return {
                    ok: false,
                    status: 403,
                    error: `Akses ditolak. Endpoint ini hanya diizinkan untuk role: ${allowedRoles.join(', ')}.`
                  };
                }
                return { ok: true, user: verified.user };
              }
      }
    : securityFallback;

  const modules = {
    security,
    authRouter: loadedAuthRouter || {
      handleAuthRouter: createNotImplementedRouter(
        'src/authRouter.js',
        'Muhammad Zikri Adam (F5512530117)',
        'feat/security-graphql-web'
      )
    },
    publicApis: loadedPublicApis || publicApisFallback,
    v1Router: loadedV1Router || {
      handleV1Router: createNotImplementedRouter(
        'src/v1Router.js',
        'Tabita Creaselia Belicia Theona (F5512520086)',
        'feat/public-apis-v1'
      )
    },
    v2Router: loadedV2Router || {
      handleV2Router: createNotImplementedRouter(
        'src/v2Router.js',
        'Lidiya (F5512530118)',
        'feat/rest-v2'
      )
    },
    graphqlSchema: loadedGraphqlSchema || {
      async executeGraphQL() {
        return {
          errors: [
            {
              message:
                '501: Modul src/graphqlSchema.js belum diimplementasikan di branch ini (branch feat/security-graphql-web).'
            }
          ]
        };
      }
    }
  };

  const moduleStatus = {
    'src/security.js': loadedSecurity ? 'ACTIVE' : 'FALLBACK',
    'src/authRouter.js': loadedAuthRouter ? 'ACTIVE' : 'FALLBACK',
    'src/publicApis.js': loadedPublicApis ? 'ACTIVE' : 'FALLBACK',
    'src/v1Router.js': loadedV1Router ? 'ACTIVE' : 'FALLBACK',
    'src/v2Router.js': loadedV2Router ? 'ACTIVE' : 'FALLBACK',
    'src/graphqlSchema.js': loadedGraphqlSchema ? 'ACTIVE' : 'FALLBACK'
  };

  cached = { modules, moduleStatus };
  return cached;
}

module.exports = {
  loadFeatureModules,
  getSecurity: () => loadFeatureModules().modules.security,
  getPublicApis: () => loadFeatureModules().modules.publicApis,
  getModuleStatus: () => loadFeatureModules().moduleStatus
};
