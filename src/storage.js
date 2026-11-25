const fs = require('fs/promises');
const path = require('path');
const config = require('./config');

// Antrean per-file agar baca-tulis JSON konkuren dalam satu proses tidak pernah saling memotong
const fileQueues = new Map();

function withFileLock(filePath, fn) {
  const prev = fileQueues.get(filePath) || Promise.resolve();
  const next = prev.then(fn, fn);
  fileQueues.set(filePath, next.catch(() => {}));
  return next;
}

async function readJSONUnlocked(filePath, defaultValue = []) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await writeJSONUnlocked(filePath, defaultValue);
      return defaultValue;
    }
    throw err;
  }
}

async function writeJSONUnlocked(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(data, null, 2) + '\n';
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, serialized, 'utf-8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.copyFile(tmpPath, filePath);
    await fs.unlink(tmpPath).catch(() => {});
  }
}

function readJSON(filePath, defaultValue = []) {
  return withFileLock(filePath, () => readJSONUnlocked(filePath, defaultValue));
}

function writeJSON(filePath, data) {
  return withFileLock(filePath, () => writeJSONUnlocked(filePath, data));
}

function nextId(items) {
  if (!Array.isArray(items) || items.length === 0) return 1;
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

module.exports = {
  getActivities: () => readJSON(config.FILES.ACTIVITIES, []),
  saveActivities: (data) => writeJSON(config.FILES.ACTIVITIES, data),
  getExpenses: () => readJSON(config.FILES.EXPENSES, []),
  saveExpenses: (data) => writeJSON(config.FILES.EXPENSES, data),
  getUsers: () => readJSON(config.FILES.USERS, []),
  saveUsers: (data) => writeJSON(config.FILES.USERS, data),
  nextId
};
