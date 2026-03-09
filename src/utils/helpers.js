const { URL } = require('url');
const fs = require('fs');
const config = require('../config');

/**
 * Spinner animation frames
 * @type {string[]}
 */
const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

/**
 * Get spinner frame by index
 * @param {number} i - Index
 * @returns {string}
 */
function getSpinner(i) {
  return SPINNER_FRAMES[i % SPINNER_FRAMES.length];
}

/**
 * Normalize directory path
 * @param {string} name - Directory name
 * @returns {string}
 */
function normalizeDir(name) {
  if (!name) return '';
  if (name === config.BASE_DIR || name.startsWith(config.BASE_DIR + '/')) return name;
  return `${config.BASE_DIR}/${name}`;
}

/**
 * Extract links dari text message
 * @param {string} text - Message text
 * @returns {string[]}
 */
function extractLinks(text) {
  return (text.match(/https?:\/\/[^\s<>'"]+/g) || []);
}

/**
 * Format duration dari seconds to human readable
 * @param {number} secs - Jumlah detik
 * @returns {string}
 */
function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h) return `${h}j ${m}m ${s}d`;
  if (m) return `${m}m ${s}d`;
  return `${s}d`;
}

/**
 * Get referer header berdasarkan URL
 * @param {string} url - Target URL
 * @returns {string}
 */
function getReferer(url) {
  try {
    const host = new URL(url).hostname || '';
    for (const [domain, referer] of Object.entries(config.CDN_REFERER_MAP)) {
      if (host === domain || host.endsWith('.' + domain)) return referer;
    }
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/`;
  } catch {
    return 'https://www.google.com/';
  }
}

/**
 * Get file size dalam MB
 * @param {string} filepath - Path to file
 * @returns {number}
 */
function getFileSizeMb(filepath) {
  try {
    return fs.statSync(filepath).size / (1024 * 1024);
  } catch {
    return 0;
  }
}

module.exports = {
  SPINNER_FRAMES,
  getSpinner,
  normalizeDir,
  extractLinks,
  formatDuration,
  getReferer,
  getFileSizeMb
};
