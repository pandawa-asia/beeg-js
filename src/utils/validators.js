const { ValidationError } = require('../errors/AppError');

/**
 * Sanitize filename - hapus invalid characters
 * @param {string} fn - Filename
 * @returns {string}
 * @throws {ValidationError}
 */
function sanitizeFilename(fn) {
  if (!fn || typeof fn !== 'string') {
    throw new ValidationError('Filename harus berupa string');
  }
  const cleaned = fn.replace(/[\\/*?:"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!cleaned) {
    throw new ValidationError('Filename tidak valid setelah sanitasi');
  }
  return cleaned;
}

/**
 * Sanitize folder name
 * @param {string} name - Folder name
 * @returns {string}
 * @throws {ValidationError}
 */
function sanitizeFoldername(name) {
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Nama folder harus berupa string');
  }
  const cleaned = name.replace(/[\\/*?:"<>|]/g, '').trim();
  if (!cleaned) {
    throw new ValidationError('Nama folder tidak valid');
  }
  return cleaned;
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}

/**
 * Validate chat ID (Telegram)
 * @param {*} chatId - Chat ID
 * @returns {boolean}
 */
function isValidChatId(chatId) {
  return chatId && (typeof chatId === 'number' || typeof chatId === 'string');
}

module.exports = {
  sanitizeFilename,
  sanitizeFoldername,
  isValidUrl,
  isValidChatId
};
