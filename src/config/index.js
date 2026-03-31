require('dotenv').config();
const { ConfigError } = require('../errors/AppError');

/**
 * Validate environment variable is present
 * @param {string} key - Variable name
 * @param {*} defaultValue - Default value if not required
 * @returns {*}
 */
function getEnv(key, defaultValue = undefined) {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new ConfigError(`❌ Variabel ${key} tidak ditemukan di .env`);
  }
  return value ?? defaultValue;
}

/**
 * Validate dan parse integer env variable
 * @param {string} key - Variable name
 * @param {number} defaultValue - Default value
 * @returns {number}
 */
function getEnvInt(key, defaultValue) {
  const value = process.env[key];
  const parsed = parseInt(value ?? defaultValue, 10);
  if (isNaN(parsed)) {
    throw new ConfigError(`❌ ${key} harus berupa integer`);
  }
  return parsed;
}

const config = {
  // Bot configuration
  BOT_TOKEN: getEnv('BOT_TOKEN'),
  ALLOWED_USER_IDS: new Set(
    (getEnv('ALLOWED_USER_IDS', '')).split(',')
      .map(s => s.trim())
      .filter(s => /^\d+$/.test(s))
      .map(Number)
  ),

  // Queue & workers
  MAX_QUEUE_SIZE: getEnvInt('MAX_QUEUE_SIZE', 100),
  MAX_WORKERS: getEnvInt('MAX_WORKERS', 5),
  MAX_RETRIES: getEnvInt('MAX_RETRIES', 3),
  TIMEOUT: getEnvInt('TIMEOUT', 30),
  PROGRESS_THROTTLE_SEC: parseFloat(process.env.PROGRESS_THROTTLE || '3'),
  BYSE_UPLOAD_CONCURRENCY: getEnvInt('BYSE_UPLOAD_CONCURRENCY', 2),

  // File management
  BASE_DIR: 'Downloads',
  DOWNLOAD_DIR_DEFAULT: '',
  DOWNLOAD_DIR_ENV: process.env.DOWNLOAD_DIR || '',
  STATE_FILE: process.env.STATE_FILE || 'bot_state.json',
  CLEANUP_DAYS: getEnvInt('CLEANUP_DAYS', 7),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // CDN Referer map untuk bypass protection
  CDN_REFERER_MAP: {
    'xhpingcdn.com': 'https://xhamster.com/',
    'xhamster.com': 'https://xhamster.com/',
    'phncdn.com': 'https://www.pornhub.com/',
    'pornhub.com': 'https://www.pornhub.com/',
    'beeg.com': 'https://beeg.com/',
    'beegcdn.com': 'https://beeg.com/',
    'xvideos-cdn.com': 'https://www.xvideos.com/',
    'xvideos.com': 'https://www.xvideos.com/',
    'xnxx-cdn.com': 'https://www.xnxx.com/',
    'xnxx.com': 'https://www.xnxx.com/',
    'rdtcdn.com': 'https://www.redtube.com/',
    'redtube.com': 'https://www.redtube.com/',
    'spankbang.com': 'https://spankbang.com/',
    'eporner.com': 'https://www.eporner.com/',
    'tnaflix.com': 'https://www.tnaflix.com/',
  },

  MAX_FOLDER_HISTORY: 3,
};

module.exports = config;
