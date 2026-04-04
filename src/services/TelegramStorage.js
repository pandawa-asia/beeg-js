'use strict';

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const STORAGE_FILE = process.env.TG_STORAGE_FILE || 'telegram_storage.json';

// ─── File size constants ───────────────────────────────────────────────────────
const STANDARD_API_LIMIT = 50 * 1024 * 1024;   // 50 MB
const LOCAL_API_LIMIT    = 2  * 1024 * 1024 * 1024; // 2 GB

// ─── Persistence ─────────────────────────────────────────────────────────────

function loadStorage() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
    }
  } catch (e) {
    logger.warn('[TgStorage] Gagal load storage file', { error: e.message });
  }
  return { records: [], lastUpdated: null };
}

function saveStorage(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.error('[TgStorage] Gagal simpan storage file', { error: e.message });
  }
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

function findByUrl(url) {
  const data = loadStorage();
  return data.records.find(r => r.url === url) || null;
}

function findById(id) {
  const data = loadStorage();
  return data.records.find(r => r.id === id) || null;
}

function getAllRecords() {
  return loadStorage().records;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload file ke Telegram storage channel.
 * Butuh bot instance (Telegraf) dan TELEGRAM_STORAGE_CHANNEL di config/env.
 *
 * @param {object} bot         - Telegraf bot instance
 * @param {string} channelId   - Channel ID target (misal: -100123456789)
 * @param {string} filePath    - Path file lokal
 * @param {object} meta        - { url, title, fileSize }
 * @param {boolean} useLocalApi - true = pakai local Bot API (limit 2GB)
 * @returns {Promise<{file_id, message_id, media_type}>}
 */
async function uploadToChannel(bot, channelId, filePath, meta = {}, useLocalApi = false) {
  const { url = '', title = '', fileSize = 0 } = meta;

  const limit = useLocalApi ? LOCAL_API_LIMIT : STANDARD_API_LIMIT;
  if (fileSize > limit) {
    const limitMb = (limit / 1024 / 1024).toFixed(0);
    throw new Error(
      `File terlalu besar untuk upload (${(fileSize / 1024 / 1024).toFixed(1)} MB > ${limitMb} MB). ` +
      (useLocalApi ? '' : 'Set TELEGRAM_API_URL ke local Bot API untuk limit 2 GB.')
    );
  }

  const caption = [
    title ? `📹 ${title}` : null,
    url   ? `🔗 ${url.slice(0, 200)}` : null,
  ].filter(Boolean).join('\n');

  const ext = path.extname(filePath).toLowerCase();
  const isVideo = ['.mp4', '.mkv', '.webm', '.mov', '.avi'].includes(ext);

  logger.info('[TgStorage] Mulai upload ke channel', {
    channelId, filePath, fileSize: `${(fileSize / 1024 / 1024).toFixed(1)} MB`
  });

  let message;
  const fileSource = { source: fs.createReadStream(filePath) };

  if (isVideo) {
    message = await bot.telegram.sendVideo(channelId, fileSource, { caption });
  } else {
    message = await bot.telegram.sendDocument(channelId, fileSource, { caption });
  }

  const file_id    = message.video?.file_id || message.document?.file_id || null;
  const media_type = message.video ? 'video' : 'document';
  const message_id = message.message_id;

  logger.info('[TgStorage] Upload selesai', { file_id: file_id?.slice(0, 30), message_id });

  return { file_id, message_id, media_type };
}

// ─── Save Record ─────────────────────────────────────────────────────────────

function saveRecord({ url, file_id, message_id, media_type, title, fileSize, channelId }) {
  const data = loadStorage();
  const id   = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Hapus record lama untuk URL yang sama (replace)
  data.records = data.records.filter(r => r.url !== url);

  data.records.push({
    id,
    url,
    file_id,
    message_id,
    media_type,
    title,
    file_size: fileSize,
    channel_id: channelId,
    uploaded_at: new Date().toISOString(),
  });

  saveStorage(data);
  return id;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function getStats() {
  const data = loadStorage();
  const totalSize = data.records.reduce((s, r) => s + (r.file_size || 0), 0);
  return {
    count: data.records.length,
    totalSizeMb: (totalSize / 1024 / 1024).toFixed(1),
    lastUpdated: data.lastUpdated,
  };
}

module.exports = {
  uploadToChannel,
  saveRecord,
  findByUrl,
  findById,
  getAllRecords,
  getStats,
  STANDARD_API_LIMIT,
  LOCAL_API_LIMIT,
};
