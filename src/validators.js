// Aturan validasi bersama untuk REST API (/v2) dan GraphQL (/graphql)
// Memenuhi ketentuan Sub-CPMK 5: "REST dan GraphQL memakai data serta aturan pemeriksaan yang sama."

const KATEGORI_VALID = ['akomodasi', 'transportasi', 'konsumsi', 'belanja', 'hiburan', 'lainnya'];
const MATA_UANG_DIDUKUNG = ['IDR', 'USD', 'JPY', 'EUR', 'SGD', 'MYR', 'GBP', 'AUD'];
const STATUS_KEGIATAN_VALID = ['PLANNED', 'ACTIVE', 'COMPLETED'];

const EXPENSE_FIELDS = ['activityId', 'title', 'category', 'amount', 'currency', 'date', 'notes'];
const ACTIVITY_FIELDS = [
  'title',
  'location',
  'budgetLimitIDR',
  'startDate',
  'endDate',
  'latitude',
  'longitude',
  'status',
  'unit',
  'leadResearcher',
  'description'
];

function validasiExpenseV2(body, isUpdate = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Body request wajib berupa objek JSON.';
  }

  if (isUpdate && !EXPENSE_FIELDS.some((k) => body[k] !== undefined)) {
    return 'Minimal satu field harus disertakan untuk pembaruan pengeluaran.';
  }

  const { activityId, title, category, amount, currency, date, notes } = body;

  if (!isUpdate && activityId === undefined) {
    return 'Breaking change v2: Field "activityId" wajib disertakan untuk mereferensikan kegiatan riset.';
  }
  if (
    activityId !== undefined &&
    (typeof activityId !== 'number' || Number.isNaN(activityId) || !Number.isInteger(activityId) || activityId <= 0)
  ) {
    return 'Field "activityId" wajib berupa angka integer positif yang valid.';
  }

  if (!isUpdate || title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return 'Field "title" wajib diisi dengan teks.';
    }
  }

  if (!isUpdate || category !== undefined) {
    if (typeof category !== 'string' || !KATEGORI_VALID.includes(category.toLowerCase())) {
      return `Field "category" harus salah satu dari: ${KATEGORI_VALID.join(', ')}.`;
    }
  }

  if (!isUpdate || amount !== undefined) {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      return 'Field "amount" wajib berupa angka lebih besar dari 0.';
    }
  }

  if (!isUpdate || currency !== undefined) {
    if (typeof currency !== 'string' || !MATA_UANG_DIDUKUNG.includes(currency.toUpperCase())) {
      return `Field "currency" harus salah satu dari: ${MATA_UANG_DIDUKUNG.join(', ')}.`;
    }
  }

  if (!isUpdate || date !== undefined) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return 'Field "date" wajib berformat YYYY-MM-DD (contoh: 2026-10-25).';
    }
  }

  if (notes !== undefined && typeof notes !== 'string') {
    return 'Field "notes" harus berupa teks.';
  }

  return null;
}

function validasiActivityV2(body, isUpdate = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Body request wajib berupa objek JSON.';
  }

  if (isUpdate && !ACTIVITY_FIELDS.some((k) => body[k] !== undefined)) {
    return 'Minimal satu field harus disertakan untuk pembaruan kegiatan.';
  }

  const {
    title,
    location,
    budgetLimitIDR,
    startDate,
    endDate,
    latitude,
    longitude,
    status,
    unit,
    leadResearcher,
    description
  } = body;

  if (!isUpdate || title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return 'Field "title" wajib berupa teks nama kegiatan riset.';
    }
  }

  if (!isUpdate || location !== undefined) {
    if (typeof location !== 'string' || location.trim() === '') {
      return 'Field "location" wajib diisi (misal: "Kabupaten Sigi, Sulawesi Tengah").';
    }
  }

  if (!isUpdate || budgetLimitIDR !== undefined) {
    if (typeof budgetLimitIDR !== 'number' || Number.isNaN(budgetLimitIDR) || budgetLimitIDR <= 0) {
      return 'Field "budgetLimitIDR" wajib berupa angka plafon anggaran dalam rupiah (> 0).';
    }
  }

  if (startDate !== undefined && (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate))) {
    return 'Field "startDate" harus berformat YYYY-MM-DD.';
  }
  if (endDate !== undefined && (typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
    return 'Field "endDate" harus berformat YYYY-MM-DD.';
  }
  if (latitude !== undefined && (typeof latitude !== 'number' || Number.isNaN(latitude) || latitude < -90 || latitude > 90)) {
    return 'Field "latitude" harus berupa angka antara -90 sampai 90.';
  }
  if (longitude !== undefined && (typeof longitude !== 'number' || Number.isNaN(longitude) || longitude < -180 || longitude > 180)) {
    return 'Field "longitude" harus berupa angka antara -180 sampai 180.';
  }
  if (status !== undefined && (typeof status !== 'string' || !STATUS_KEGIATAN_VALID.includes(status.toUpperCase()))) {
    return `Field "status" harus salah satu dari: ${STATUS_KEGIATAN_VALID.join(', ')}.`;
  }
  if (unit !== undefined && typeof unit !== 'string') {
    return 'Field "unit" harus berupa teks.';
  }
  if (leadResearcher !== undefined && typeof leadResearcher !== 'string') {
    return 'Field "leadResearcher" harus berupa teks.';
  }
  if (description !== undefined && typeof description !== 'string') {
    return 'Field "description" harus berupa teks.';
  }

  return null;
}

module.exports = {
  KATEGORI_VALID,
  MATA_UANG_DIDUKUNG,
  STATUS_KEGIATAN_VALID,
  validasiExpenseV2,
  validasiActivityV2
};
