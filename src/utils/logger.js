const clack = require('@clack/prompts');
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

const logger = {
  info(message, meta = {}) {
    clack.log.info(message + metaStr(meta));
    logToFile('INFO', message, meta);
  },

  success(message, meta = {}) {
    clack.log.success(message + metaStr(meta));
    logToFile('INFO', message, meta);
  },

  warn(message, meta = {}) {
    clack.log.warn(message + metaStr(meta));
    logToFile('WARN', message, meta);
  },

  error(message, meta = {}) {
    clack.log.error(message + metaStr(meta));
    logToFile('ERROR', message, meta);
  },

  step(message, meta = {}) {
    clack.log.step(message + metaStr(meta));
    logToFile('INFO', message, meta);
  },

  debug(message, meta = {}) {
    if (process.env.LOG_LEVEL === 'debug') {
      clack.log.info(`[debug] ${message}` + metaStr(meta));
    }
    logToFile('DEBUG', message, meta);
  },

  intro(message) {
    clack.intro(message);
  },

  outro(message) {
    clack.outro(message);
  }
};

module.exports = logger;
