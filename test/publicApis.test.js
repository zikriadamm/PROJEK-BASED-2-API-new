// test/publicApis.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const publicApis = require('../src/publicApis');

describe('Issue #2 — Unit Test Public APIs & Fallback (src/publicApis.js)', () => {
  it('getLiveRates() mengembalikan kurs dengan struktur yang benar', async () => {
    const res = await publicApis.getLiveRates();
    assert.ok(res.rates && typeof res.rates === 'object');
    assert.ok(['live_public_api', 'cache_fallback'].includes(res.sumber));
    assert.ok(['ONLINE', 'OFFLINE_CACHE'].includes(res.status));
    assert.ok(res.terakhirDiperbarui);
  });

  it('konversiKeIDR() menghitung konversi IDR dan valas secara akurat', () => {
    const idr = publicApis.konversiKeIDR(50000, 'IDR');
    assert.equal(idr.nominalIDR, 50000);
    assert.equal(idr.kursPerSatuanIDR, 1);
    assert.ok(idr.formatRupiah.startsWith('Rp '));

    const usd = publicApis.konversiKeIDR(10, 'USD', { USD: 1, IDR: 16000 });
    assert.equal(usd.nominalIDR, 160000);
    assert.equal(usd.kursPerSatuanIDR, 16000);
    assert.ok(usd.keterangan.includes('1 USD'));
  });

  it('getWeatherForecast() mengembalikan prakiraan cuaca dengan teks bahasa Indonesia', async () => {
    const cuaca = await publicApis.getWeatherForecast(-0.836, 119.893);
    assert.equal(typeof cuaca.temperature, 'number');
    assert.ok(cuaca.temperatureFormatted.includes('°C'));
    assert.ok(cuaca.condition);
    assert.ok(['live_open_meteo_api', 'cache_fallback'].includes(cuaca.sumber));
  });

  it('beralih mulus ke cache_fallback saat fetch gagal/timeout (simulasi offline)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Simulasi jaringan putus / timeout');
    };

    try {
      const ratesFallback = await publicApis.getLiveRates();
      assert.equal(ratesFallback.sumber, 'cache_fallback');
      assert.equal(ratesFallback.status, 'OFFLINE_CACHE');
      assert.ok(ratesFallback.rates.IDR > 0);

      const weatherFallback = await publicApis.getWeatherForecast(-0.836, 119.893);
      assert.equal(weatherFallback.sumber, 'cache_fallback');
      assert.equal(weatherFallback.status, 'OFFLINE_CACHE');
      assert.equal(typeof weatherFallback.temperature, 'number');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
