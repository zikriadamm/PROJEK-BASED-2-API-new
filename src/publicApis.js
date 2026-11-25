// src/publicApis.js
// Penanggung Jawab: Tabita Creaselia Belicia Theona (F5512520086)

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

// In-memory cache fallback
let cachedRates = { ...FALLBACK_RATES };
let lastRatesUpdated = null;
const cachedWeatherByCoord = new Map();

function terjemahkanKodeWmo(kode) {
  const kamus = {
    0: 'Langit Cerah Bersih',
    1: 'Sebagian Besar Cerah',
    2: 'Cerah Berawan',
    3: 'Mendung Berawan Tebal',
    45: 'Berkabut',
    48: 'Kabut Rime Mengendap',
    51: 'Gerimis Ringan',
    53: 'Gerimis Sedang',
    55: 'Gerimis Lebat',
    61: 'Hujan Ringan',
    63: 'Hujan Sedang',
    65: 'Hujan Lebat',
    80: 'Hujan Deras Lokal Ringan',
    81: 'Hujan Deras Lokal Sedang',
    82: 'Hujan Badai Lokal Dahsyat',
    95: 'Badai Petir Ringan/Sedang',
    96: 'Badai Petir dengan Hujan Es'
  };
  return kamus[kode] || 'Cuaca Bervariasi';
}

/**
 * Public API 1: ExchangeRate-API (https://open.er-api.com/v6/latest/USD)
 * Timeout 4 detik dengan in-memory cache fallback jika gagal/offline
 */
async function getLiveRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(4000)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data || !data.rates) {
      throw new Error('Format response ExchangeRate-API tidak valid');
    }

    cachedRates = { ...FALLBACK_RATES, ...data.rates };
    lastRatesUpdated = new Date().toISOString();

    return {
      rates: cachedRates,
      sumber: 'live_public_api',
      status: 'ONLINE',
      terakhirDiperbarui: lastRatesUpdated
    };
  } catch (err) {
    return {
      rates: cachedRates,
      sumber: 'cache_fallback',
      status: 'OFFLINE_CACHE',
      terakhirDiperbarui: lastRatesUpdated || 'cache_awal_statis'
    };
  }
}

/**
 * Konversi nominal dari mata uang asing / IDR ke Rupiah (IDR)
 */
function konversiKeIDR(amount, currency = 'IDR', rates = cachedRates) {
  const cur = (currency || 'IDR').toUpperCase();
  const nominal = Number(amount) || 0;

  if (cur === 'IDR') {
    const val = Math.round(nominal);
    return {
      nominalIDR: val,
      kursPerSatuanIDR: 1,
      formatRupiah: 'Rp ' + val.toLocaleString('id-ID'),
      keterangan: 'Mata uang lokal (IDR)'
    };
  }

  const rateMap = rates || cachedRates;
  const rateAsal = rateMap[cur] || FALLBACK_RATES[cur] || 1;
  const rateIDR = rateMap.IDR || FALLBACK_RATES.IDR || 16250;

  const nominalIDR = Math.round((nominal / rateAsal) * rateIDR);
  const kursPerSatuanIDR = Math.round((1 / rateAsal) * rateIDR);

  return {
    nominalIDR,
    kursPerSatuanIDR,
    formatRupiah: 'Rp ' + nominalIDR.toLocaleString('id-ID'),
    keterangan: `1 ${cur} ≈ Rp ${kursPerSatuanIDR.toLocaleString('id-ID')}`
  };
}

/**
 * Public API 2: Open-Meteo (https://api.open-meteo.com/v1/forecast)
 * Default koordinat Kampus Untad Tondo (-0.836, 119.893), timeout 4 detik + cache fallback
 */
async function getWeatherForecast(lat = -0.836, lon = 119.893) {
  const latitude =
    lat !== undefined && lat !== null && !Number.isNaN(Number(lat)) ? Number(lat) : -0.836;
  const longitude =
    lon !== undefined && lon !== null && !Number.isNaN(Number(lon)) ? Number(lon) : 119.893;
  const coordKey = `${latitude},${longitude}`;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data || !data.current_weather) {
      throw new Error('Format response Open-Meteo tidak valid');
    }

    const cw = data.current_weather;
    const hasil = {
      temperature: cw.temperature,
      temperatureFormatted: `${cw.temperature}°C`,
      windSpeed: cw.windspeed,
      windSpeedFormatted: `${cw.windspeed} km/h`,
      weatherCode: cw.weathercode,
      condition: terjemahkanKodeWmo(cw.weathercode),
      latitude,
      longitude,
      sumber: 'live_open_meteo_api',
      status: 'ONLINE',
      waktuAmbil: new Date().toISOString()
    };

    cachedWeatherByCoord.set(coordKey, hasil);
    return hasil;
  } catch (err) {
    const cached = cachedWeatherByCoord.get(coordKey);
    if (cached) {
      return {
        ...cached,
        sumber: 'cache_fallback',
        status: 'OFFLINE_CACHE'
      };
    }

    return {
      temperature: 31.5,
      temperatureFormatted: '31.5°C',
      windSpeed: 10.2,
      windSpeedFormatted: '10.2 km/h',
      weatherCode: 1,
      condition: 'Cerah Berawan',
      latitude,
      longitude,
      sumber: 'cache_fallback',
      status: 'OFFLINE_CACHE',
      waktuAmbil: new Date().toISOString()
    };
  }
}

module.exports = {
  getLiveRates,
  konversiKeIDR,
  getWeatherForecast
};
