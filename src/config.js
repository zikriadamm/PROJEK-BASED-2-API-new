const path = require('path');
const fs = require('fs');

// Parser .env murni berbasis fs bawaan Node.js (tanpa dependensi eksternal)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.substring(0, idx).trim();
    let val = trimmed.substring(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  });
}

if (!process.env.API_KEY || !process.env.JWT_SECRET) {
  console.warn(
    '[Config Warning] API_KEY atau JWT_SECRET belum diatur di file .env. Salin .env.example menjadi .env sebelum produksi/demo.'
  );
}

module.exports = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  API_KEY: process.env.API_KEY || 'dev-only-set-api-key-in-env',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-set-jwt-secret-in-env',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATA_DIR: path.join(__dirname, '..', 'data'),
  FILES: {
    ACTIVITIES: path.join(__dirname, '..', 'data', 'activities.json'),
    EXPENSES: path.join(__dirname, '..', 'data', 'expenses.json'),
    USERS: path.join(__dirname, '..', 'data', 'users.json')
  }
};
