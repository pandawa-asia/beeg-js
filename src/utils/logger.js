'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = 'logs';
const LOG_FILE = path.join(LOG_DIR, 'combined.log');
const ERR_FILE = path.join(LOG_DIR, 'error.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function writeFile(file, level, message, meta) {
  try {
    const metaStr = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    const line = `${timestamp()} [${level}] ${message}${metaStr}\n`;
    fs.appendFileSync(file, line);
  } catch {}
}

function logToFile(level, message, meta) {
  writeFile(LOG_FILE, level, message, meta);
  if (level === 'ERROR') {
    writeFile(ERR_FILE, level, message, meta);
  }
}

function metaStr(meta) {
  if (!meta || Object.keys(meta).length === 0) return '';
  return ' ' + Object.entries(meta)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
}

const COLORS = {
  reset: '\x1b[0m',
  info: '\x1b[36m',
  success: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
  step: '\x1b[35m',
};

function colorize(color, text) {
  return `${color}${text}${COLORS.reset}`;
}

const logger = {
  info(message, meta = {}) {
    console.log(colorize(COLORS.info, `ℹ ${message}`) + metaStr(meta));
    logToFile('INFO', message, meta);
  },

  success(message, meta = {}) {
    console.log(colorize(COLORS.success, `✓ ${message}`) + metaStr(meta));
    logToFile('INFO', message, meta);
  },

  warn(message, meta = {}) {
    console.warn(colorize(COLORS.warn, `⚠ ${message}`) + metaStr(meta));
    logToFile('WARN', message, meta);
  },

  error(message, meta = {}) {
    console.error(colorize(COLORS.error, `✖ ${message}`) + metaStr(meta));
    logToFile('ERROR', message, meta);
  },

  step(message, meta = {}) {
    console.log(colorize(COLORS.step, `◆ ${message}`) + metaStr(meta));
    logToFile('INFO', message, meta);
  },

  debug(message, meta = {}) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(colorize(COLORS.debug, `[debug] ${message}`) + metaStr(meta));
    }
    logToFile('DEBUG', message, meta);
  },

  intro(message) {
    console.log(colorize(COLORS.success, `┌  ${message}`));
  },

  outro(message) {
    console.log(colorize(COLORS.success, `└  ${message}`));
  }
};

module.exports = logger;
