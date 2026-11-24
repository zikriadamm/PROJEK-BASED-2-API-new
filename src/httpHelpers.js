function kirimJSON(res, statusCode, data, customHeaders = {}) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, X-API-KEY',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...customHeaders
  });
  res.end(body);
}

function kirimError(res, statusCode, pesan, detail = null, customHeaders = {}) {
  const payload = {
    sukses: false,
    status: statusCode,
    error: pesan
  };
  if (detail !== null && detail !== undefined) {
    payload.detail = detail;
  }
  kirimJSON(res, statusCode, payload, customHeaders);
}

function bacaBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let terlaluBesar = false;

    req.on('data', (chunk) => {
      if (terlaluBesar) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        terlaluBesar = true;
        const errLimit = new Error('Ukuran body request melebihi batas maksimal 1 MB.');
        errLimit.statusCode = 413;
        req.destroy();
        return reject(errLimit);
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (terlaluBesar) return;
      const body = Buffer.concat(chunks).toString('utf-8');
      if (!body.trim()) return resolve(null);
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        const errorJSON = new Error('Body request bukan format JSON yang valid.');
        errorJSON.statusCode = 400;
        reject(errorJSON);
      }
    });

    req.on('error', (err) => {
      if (!terlaluBesar) reject(err);
    });
  });
}

module.exports = {
  kirimJSON,
  kirimError,
  bacaBody
};
