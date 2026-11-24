const fs = require('fs/promises');
const path = require('path');
const config = require('./config');

async function readJSON(filePath, defaultValue = []) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await writeJSON(filePath, defaultValue);
      return defaultValue;
    }
    throw err;
  }
}

async function writeJSON(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
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
