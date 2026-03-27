'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { URL } = require('url');
const logger = require('../utils/logger');

const BYSE_BASE = 'https://api.byse.sx';
const HTTP_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 600_000;

let _cachedDomain = null;

async function getByseFileUrl(apiKey, filecode) {
  if (!_cachedDomain) {
    try {
      const res = await httpGet(`${BYSE_BASE}/get/domain?key=${encodeURIComponent(apiKey)}`);
      _cachedDomain = res.embed_domain || res.new_domain || res.old_domain || null;
      if (_cachedDomain) {
        logger.info('Byse embed domain', { domain: _cachedDomain });
      } else {
        logger.warn('Byse domain tidak ditemukan di response', { res });
      }
    } catch (e) {
      logger.error('Gagal ambil Byse domain', { error: e.message });
    }
  }
  const domain = _cachedDomain || 'byse.sx';
  return `https://${domain}/e/${filecode}`;
}

function httpGet(url, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Terlalu banyak redirect'));

  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: HTTP_TIMEOUT_MS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return httpGet(next, redirectCount + 1).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Response bukan JSON valid (${res.statusCode}): ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout (${HTTP_TIMEOUT_MS / 1000}s) ke: ${url}`));
    });

    req.on('error', reject);
  });
}

const _folderCache = {};

async function listFolders(apiKey) {
  try {
    const res = await httpGet(`${BYSE_BASE}/folder/list?key=${encodeURIComponent(apiKey)}&fld_id=0`);
    if (res.status === 200 && res.result && res.result.folders) {
      return res.result.folders;
    }
    logger.warn('listFolders: response tidak valid', { status: res.status, msg: res.msg });
    return [];
  } catch (e) {
    logger.error('listFolders error', { error: e.message });
    return [];
  }
}

async function getOrCreateFolder(apiKey, name) {
  if (_folderCache[name]) return _folderCache[name];
  try {
    const folders = await listFolders(apiKey);
    const existing = folders.find(f => f.name && f.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      _folderCache[name] = existing.fld_id;
      logger.info('Byse folder ditemukan', { name, fld_id: existing.fld_id });
      return existing.fld_id;
    }

    const res = await httpGet(
      `${BYSE_BASE}/folder/create?key=${encodeURIComponent(apiKey)}&name=${encodeURIComponent(name)}&parent_id=0`
    );
    if (res.status === 200 && res.result && res.result.fld_id) {
      _folderCache[name] = res.result.fld_id;
      logger.info('Byse folder dibuat', { name, fld_id: res.result.fld_id });
      return res.result.fld_id;
    }
    logger.error('Byse gagal buat folder', { name, msg: res.msg });
    return null;
  } catch (e) {
    logger.error('Byse getOrCreateFolder error', { error: e.message });
    return null;
  }
}

async function setFileFolder(apiKey, filecode, fld_id, retries = 3, delayMs = 8000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await httpGet(
        `${BYSE_BASE}/file/clone?key=${encodeURIComponent(apiKey)}&file_code=${encodeURIComponent(filecode)}&fld_id=${encodeURIComponent(fld_id)}`
      );
      if (res.status === 200) {
        logger.info('Byse file dipindah ke folder', { filecode, fld_id });
        return true;
      }
      logger.warn(`Byse setFileFolder gagal (attempt ${attempt}/${retries})`, { msg: res.msg, filecode, fld_id });
    } catch (e) {
      logger.error(`Byse setFileFolder error (attempt ${attempt}/${retries})`, { error: e.message });
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  logger.error('Byse setFileFolder gagal setelah semua retry', { filecode, fld_id });
  return false;
}

async function addRemoteUpload(apiKey, url) {
  const endpoint = `${BYSE_BASE}/remote/add?key=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}`;
  try {
    const res = await httpGet(endpoint);
    if (res.status === 200 && res.result && res.result.filecode) {
      return { ok: true, filecode: res.result.filecode };
    }
    return { ok: false, error: res.msg || 'Unknown error dari Byse' };
  } catch (e) {
    logger.error('Byse addRemoteUpload error', { error: e.message });
    return { ok: false, error: e.message };
  }
}

async function removeRemoteUpload(apiKey, fileCode) {
  const endpoint = `${BYSE_BASE}/remote/remove?key=${encodeURIComponent(apiKey)}&file_code=${encodeURIComponent(fileCode)}`;
  try {
    const res = await httpGet(endpoint);
    return { ok: res.status === 200, msg: res.msg || '' };
  } catch (e) {
    logger.error('Byse removeRemoteUpload error', { error: e.message });
    return { ok: false, msg: e.message };
  }
}

async function checkRemoteStatus(apiKey, fileCode) {
  const endpoint = `${BYSE_BASE}/remote/status?key=${encodeURIComponent(apiKey)}&file_code=${encodeURIComponent(fileCode)}`;
  try {
    const res = await httpGet(endpoint);
    if (res.status === 200 && res.result) {
      const data = res.result;
      const statusUpper = (data.status || '').toUpperCase();
      const isDone = ['OK', 'DONE', 'TRANSFERRED', 'FINISHED'].includes(statusUpper);
      const isError = statusUpper === 'ERROR' || statusUpper === 'FAILED';
      return { ok: true, data, isDone, isError };
    }
    return { ok: false, error: res.msg || 'Unknown error', isDone: false, isError: false };
  } catch (e) {
    logger.error('Byse checkRemoteStatus error', { error: e.message });
    return { ok: false, error: e.message, isDone: false, isError: false };
  }
}

async function getUploadServer(apiKey) {
  const endpoint = `${BYSE_BASE}/upload/server?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await httpGet(endpoint);
    if (res.status === 200 && res.result) {
      return { ok: true, serverUrl: res.result };
    }
    return { ok: false, error: res.msg || 'Gagal mendapatkan upload server' };
  } catch (e) {
    logger.error('Byse getUploadServer error', { error: e.message });
    return { ok: false, error: e.message };
  }
}

async function getAccountInfo(apiKey) {
  try {
    const res = await httpGet(`${BYSE_BASE}/account/info?key=${encodeURIComponent(apiKey)}`);
    if (res.status === 200 && res.result) {
      return { ok: true, data: res.result };
    }
    return { ok: false, error: res.msg || 'Gagal ambil info akun' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getFileInfo(apiKey, filecode) {
  try {
    const res = await httpGet(
      `${BYSE_BASE}/file/info?key=${encodeURIComponent(apiKey)}&file_code=${encodeURIComponent(filecode)}`
    );
    if (res.status === 200 && res.result && res.result[0]) {
      return { ok: true, data: res.result[0] };
    }
    return { ok: false, error: res.msg || 'File tidak ditemukan' };
  } catch (e) {
    logger.error('Byse getFileInfo error', { error: e.message });
    return { ok: false, error: e.message };
  }
}

async function getEncodingStatus(apiKey, filecode) {
  try {
    const res = await httpGet(
      `${BYSE_BASE}/encoding/status?key=${encodeURIComponent(apiKey)}&file_code=${encodeURIComponent(filecode)}`
    );
    if (res.status === 200 && res.result) {
      return { ok: true, data: res.result };
    }
    return { ok: false, error: res.msg || 'Encoding status tidak tersedia' };
  } catch (e) {
    logger.error('Byse getEncodingStatus error', { error: e.message });
    return { ok: false, error: e.message };
  }
}

function uploadLocalFile(serverUrl, apiKey, filepath, onProgress = null) {
  return new Promise((resolve, reject) => {
    const filename = path.basename(filepath);
    const boundary = `----ByseFormBoundary${Date.now()}`;
    const CRLF = '\r\n';

    let fileSize;
    try {
      fileSize = fs.statSync(filepath).size;
    } catch {
      return reject(new Error(`File tidak ditemukan: ${filepath}`));
    }

    const metaPart = Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="key"${CRLF}${CRLF}` +
      `${apiKey}${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
      `Content-Type: application/octet-stream${CRLF}${CRLF}`
    );
    const endPart = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
    const totalSize = metaPart.length + fileSize + endPart.length;

    let parsedUrl;
    try {
      parsedUrl = new URL(serverUrl);
    } catch {
      return reject(new Error(`URL upload server tidak valid: ${serverUrl}`));
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || undefined,
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalSize,
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === 200 && parsed.files && parsed.files[0]) {
            const f = parsed.files[0];
            if (f.status === 'OK' || f.filecode) {
              resolve({ ok: true, filecode: f.filecode, filename: f.filename });
            } else {
              resolve({ ok: false, error: f.status || 'Upload file ditolak server' });
            }
          } else {
            resolve({ ok: false, error: parsed.msg || `HTTP ${res.statusCode}: Upload gagal` });
          }
        } catch {
          reject(new Error(`Response tidak valid dari upload server: ${data.slice(0, 300)}`));
        }
      });
    });

    req.setTimeout(UPLOAD_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Upload timeout (${UPLOAD_TIMEOUT_MS / 1000}s) — file mungkin terlalu besar atau koneksi lambat`));
    });

    req.on('error', reject);

    req.write(metaPart);

    const fileStream = fs.createReadStream(filepath, { highWaterMark: 64 * 1024 });
    let uploaded = 0;
    let lastReportedPct = -1;

    fileStream.on('data', chunk => {
      const canContinue = req.write(chunk);
      uploaded += chunk.length;
      const pct = Math.floor((uploaded / fileSize) * 100);
      if (onProgress && pct !== lastReportedPct && pct % 5 === 0) {
        lastReportedPct = pct;
        onProgress(pct, uploaded, fileSize);
      }
      if (!canContinue) {
        fileStream.pause();
        req.once('drain', () => fileStream.resume());
      }
    });

    fileStream.on('end', () => {
      req.write(endPart);
      req.end();
    });

    fileStream.on('error', err => {
      req.destroy();
      reject(err);
    });
  });
}

module.exports = {
  addRemoteUpload,
  removeRemoteUpload,
  checkRemoteStatus,
  getUploadServer,
  uploadLocalFile,
  getByseFileUrl,
  getOrCreateFolder,
  setFileFolder,
  getAccountInfo,
  getFileInfo,
  getEncodingStatus,
};
