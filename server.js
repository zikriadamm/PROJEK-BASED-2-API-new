const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

const config = require('./src/config');
const { kirimJSON, kirimError, bacaBody } = require('./src/httpHelpers');
const { loadFeatureModules } = require('./src/moduleLoader');

const { modules, moduleStatus } = loadFeatureModules();
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const OPENAPI_PATH = path.join(__dirname, 'openapi.yaml');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

async function serveStaticFile(res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'text/plain; charset=utf-8';
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  } catch (err) {
    kirimError(res, 404, 'Berkas statis tidak ditemukan.');
  }
}

function buildApiOverview() {
  const hasDashboard = fsSync.existsSync(path.join(PUBLIC_DIR, 'index.html'));
  const hasOpenApi = fsSync.existsSync(OPENAPI_PATH);

  return {
    namaSistem: 'Untad Field Research & Travel Expense API (Sub-CPMK 5)',
    status: 'ONLINE',
    kelompok: 'Kelompok 2 TIC - S1 Teknik Informatika, Fakultas Teknik Universitas Tadulako',
    anggota: [
      { nama: 'Muhammad Zikri Adam', stambuk: 'F5512530117', branches: ['feat/issue-1-security-auth', 'feat/issue-5-graphql', 'feat/issue-6-web-dashboard', 'style/web-dashboard-v15'] },
      { nama: 'Lidiya', stambuk: 'F5512530118', branches: ['feat/issue-4-rest-v2'] },
      { nama: 'Tabita Creaselia Belicia Theona', stambuk: 'F5512520086', branches: ['feat/public-apis-v1'] },
      { nama: 'Trista Sheryl Lambei', stambuk: 'F5512530106', branches: ['feat/issue-7-docs-cli', 'feat/issue-8-postman'] }
    ],
    statusModul: {
      ...moduleStatus,
      'public/index.html': hasDashboard ? 'ACTIVE' : 'NOT_YET_ADDED',
      'openapi.yaml': hasOpenApi ? 'ACTIVE' : 'NOT_YET_ADDED'
    },
    endpointsUtama: {
      infoApi: 'GET /api',
      webDashboard: 'GET /',
      openApiSpec: 'GET /openapi.yaml',
      authLogin: 'POST /v2/auth/login',
      authLogout: 'POST /v2/auth/logout',
      restV1Legacy: 'GET /v1/expenses',
      restV2Activities: 'GET, POST, PUT, DELETE /v2/activities',
      restV2Expenses: 'GET, POST, PUT, DELETE /v2/expenses',
      restV2Summary: 'GET /v2/expenses/summary',
      graphQL: 'POST /graphql'
    }
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  // 1. CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, X-API-KEY',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  try {
    // 2. Spesifikasi OpenAPI (GET /openapi.yaml)
    if ((pathname === '/openapi.yaml' || pathname === '/openapi.yml') && method === 'GET') {
      if (fsSync.existsSync(OPENAPI_PATH)) {
        return serveStaticFile(res, OPENAPI_PATH);
      }
      return kirimError(res, 404, 'Berkas openapi.yaml belum tersedia di branch ini.', {
        owner: 'Trista Sheryl Lambei (F5512530106)',
        branch: 'feat/docs-testing-cli'
      });
    }

    // 3. Web Dashboard & Aset Statis (public/)
    if ((pathname === '/' || pathname === '/app') && method === 'GET') {
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      if (fsSync.existsSync(indexPath)) {
        return serveStaticFile(res, indexPath);
      }
      return kirimJSON(res, 200, buildApiOverview());
    }

    if (
      method === 'GET' &&
      (pathname.startsWith('/public/') || pathname.startsWith('/css/') || pathname.startsWith('/js/'))
    ) {
      let decodedSubPath;
      try {
        decodedSubPath = decodeURIComponent(pathname.replace(/^\/(public|css|js)\//, ''));
      } catch (e) {
        return kirimError(res, 400, 'Format URL berkas statis tidak valid.');
      }
      const targetPath = path.resolve(PUBLIC_DIR, decodedSubPath);
      if (!targetPath.startsWith(PUBLIC_DIR + path.sep)) {
        return kirimError(res, 403, 'Akses direktori di luar public tidak diizinkan.');
      }
      if (fsSync.existsSync(targetPath)) {
        return serveStaticFile(res, targetPath);
      }
      return kirimError(res, 404, 'Berkas statis tidak ditemukan.');
    }

    // 4. Info Root API (GET /api)
    if (pathname === '/api' && method === 'GET') {
      return kirimJSON(res, 200, buildApiOverview());
    }

    // 5. Verifikasi API Key untuk seluruh rute API (/v1, /v2, /graphql)
    const isApiRequest =
      pathname === '/v1' ||
      pathname.startsWith('/v1/') ||
      pathname === '/v2' ||
      pathname.startsWith('/v2/') ||
      pathname === '/graphql';

    if (isApiRequest) {
      const apiKeyCheck = modules.security.verifyApiKey(req);
      if (!apiKeyCheck.valid) {
        return kirimError(res, 401, apiKeyCheck.error || 'Header x-api-key tidak valid.', {
          petunjuk: 'Sertakan header "x-api-key" yang sesuai konfigurasi .env server.'
        });
      }
    }

    // 6. Router REST v1 (Legacy + Header Sunset) — Tabita
    if (pathname === '/v1' || pathname.startsWith('/v1/')) {
      return await modules.v1Router.handleV1Router(req, res, pathname, method, query);
    }

    // 7. Router Auth (/v2/auth/*) — Zikri (dipisah dari v2Router agar bebas merge conflict)
    if (pathname === '/v2/auth' || pathname.startsWith('/v2/auth/')) {
      return await modules.authRouter.handleAuthRouter(req, res, pathname, method, query);
    }

    // 8. Router REST v2 (/v2/activities, /v2/expenses, /v2/expenses/summary) — Lidiya
    if (pathname === '/v2' || pathname.startsWith('/v2/')) {
      return await modules.v2Router.handleV2Router(req, res, pathname, method, query);
    }

    // 9. Endpoint GraphQL (POST /graphql) — Zikri
    if (pathname === '/graphql') {
      if (method !== 'POST') {
        return kirimError(res, 405, 'Endpoint GraphQL hanya menerima metode POST.');
      }

      const body = await bacaBody(req);
      if (!body || typeof body.query !== 'string' || !body.query.trim()) {
        return kirimError(res, 400, 'Body request GraphQL wajib memuat properti string "query".');
      }

      const tokenStr = modules.security.extractBearerToken(req);
      let userContext = null;
      if (tokenStr) {
        const verifyRes = modules.security.verifyToken(tokenStr);
        if (verifyRes.valid) {
          userContext = verifyRes.user;
        }
      }

      const gqlResult = await modules.graphqlSchema.executeGraphQL(
        body.query,
        body.variables || null,
        { req, user: userContext }
      );

      const gqlErrors = Array.isArray(gqlResult?.errors) ? gqlResult.errors : [];
      let statusCode = 200;
      if (gqlErrors.some((e) => String(e.message).startsWith('401'))) statusCode = 401;
      else if (gqlErrors.some((e) => String(e.message).startsWith('403'))) statusCode = 403;
      else if (gqlErrors.some((e) => String(e.message).startsWith('400'))) statusCode = 400;
      else if (gqlErrors.some((e) => String(e.message).startsWith('404'))) statusCode = 404;
      else if (gqlErrors.some((e) => String(e.message).startsWith('501'))) statusCode = 501;

      return kirimJSON(res, statusCode, gqlResult);
    }

    // 10. 404 Not Found
    return kirimError(res, 404, `Endpoint ${method} ${pathname} tidak ditemukan.`);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status < 500) {
      return kirimError(res, status, err.message);
    }
    console.error('[Server Internal Error]', err);
    return kirimError(res, 500, 'Terjadi kesalahan internal pada server.');
  }
});

if (require.main === module) {
  console.log('================================================================================');
  console.log('  FINAL PROJECT REKAYASA API (Sub-CPMK 5) - KELOMPOK 2 TIC');
  console.log('  Sistem Manajemen Biaya & Logistik Riset Lapangan Fakultas Teknik Untad');
  console.log('  1. Muhammad Zikri Adam (F5512530117)           - Issues #1, #5, #6');
  console.log('  2. Lidiya (F5512530118)                        - Issue  #4 (feat/issue-4-rest-v2)');
  console.log('  3. Tabita Creaselia Belicia Theona (F5512520086) - Issues #2, #3 (feat/public-apis-v1)');
  console.log('  4. Trista Sheryl Lambei (F5512530106)          - Issues #7, #8 (feat/issue-7-docs-cli, feat/issue-8-postman)');
  console.log('================================================================================');

  server.listen(config.PORT, () => {
    console.log(`[Server Aktif] http://localhost:${config.PORT}  (Overview: GET /api)`);
    console.log('[Status Modul Fitur]');
    Object.entries(moduleStatus).forEach(([file, st]) => {
      console.log(`  - ${file.padEnd(24)} : ${st}`);
    });
    console.log('');
  });
}

module.exports = server;
