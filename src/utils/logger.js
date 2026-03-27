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
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function dateStamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function writeFile(file, level, message, meta) {
  try {
    const metaStr = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    const line = `${dateStamp()} [${level}] ${message}${metaStr}\n`;
    fs.appendFileSync(file, line);
  } catch {}
}

function logToFile(level, message, meta) {
  writeFile(LOG_FILE, level, message, meta);
  if (level === 'ERROR') {
    writeFile(ERR_FILE, level, message, meta);
  }
}

function metaInline(meta) {
  if (!meta || Object.keys(meta).length === 0) return '';
  const parts = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${C.dim}${k}=${C.reset}${C.dim}${typeof v === 'object' ? JSON.stringify(v) : v}${C.reset}`);
  return parts.length ? '  ' + parts.join(' ') : '';
}

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  gray:    '\x1b[90m',
};

function ts() {
  return `${C.gray}[${timestamp()}]${C.reset}`;
}

const logger = {
  info(message, meta = {}) {
    console.log(`${ts()} ${C.cyan}ℹ${C.reset}  ${message}${metaInline(meta)}`);
    logToFile('INFO', message, meta);
  },

  success(message, meta = {}) {
    console.log(`${ts()} ${C.green}✔${C.reset}  ${C.green}${message}${C.reset}${metaInline(meta)}`);
    logToFile('INFO', message, meta);
  },

  warn(message, meta = {}) {
    console.warn(`${ts()} ${C.yellow}⚠${C.reset}  ${C.yellow}${message}${C.reset}${metaInline(meta)}`);
    logToFile('WARN', message, meta);
  },

  error(message, meta = {}) {
    console.error(`${ts()} ${C.red}✖${C.reset}  ${C.bold}${C.red}${message}${C.reset}${metaInline(meta)}`);
    logToFile('ERROR', message, meta);
  },

  step(message, meta = {}) {
    console.log(`${ts()} ${C.magenta}◆${C.reset}  ${message}${metaInline(meta)}`);
    logToFile('INFO', message, meta);
  },

  debug(message, meta = {}) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`${ts()} ${C.gray}·  ${message}${metaInline(meta)}${C.reset}`);
    }
    logToFile('DEBUG', message, meta);
  },

  download: {
    start(filename, folder, chatId, workerId) {
      console.log(
        `${ts()} ${C.blue}▼${C.reset}  ${C.bold}DOWNLOAD MULAI${C.reset}` +
        `  ${C.yellow}${truncate(filename, 40)}${C.reset}` +
        `  ${C.gray}→ ${folder}  W${workerId}  chat:${chatId}${C.reset}`
      );
      logToFile('INFO', `Download mulai: ${filename}`, { folder, chatId, workerId });
    },

    done(filename, folder, sizeMb, elapsed, workerId) {
      console.log(
        `${ts()} ${C.green}✔${C.reset}  ${C.bold}${C.green}DOWNLOAD SELESAI${C.reset}` +
        `  ${C.yellow}${truncate(filename, 40)}${C.reset}` +
        `  ${C.gray}${sizeMb.toFixed(1)} MB · ${elapsed}s · W${workerId}${C.reset}`
      );
      logToFile('INFO', `Download selesai: ${filename}`, { folder, sizeMb, elapsed, workerId });
    },

    fail(filename, reason, workerId) {
      console.log(
        `${ts()} ${C.red}✖${C.reset}  ${C.bold}DOWNLOAD GAGAL${C.reset}` +
        `  ${C.yellow}${truncate(filename, 40)}${C.reset}` +
        `  ${C.gray}W${workerId}: ${truncate(reason, 60)}${C.reset}`
      );
      logToFile('WARN', `Download gagal: ${filename}`, { reason, workerId });
    },

    retry(filename, attempt, maxRetries) {
      console.log(
        `${ts()} ${C.yellow}↺${C.reset}  RETRY ${attempt}/${maxRetries}` +
        `  ${C.gray}${truncate(filename, 50)}${C.reset}`
      );
    },
  },

  upload: {
    start(filename, destination) {
      console.log(
        `${ts()} ${C.magenta}↑${C.reset}  ${C.bold}UPLOAD MULAI${C.reset}` +
        `  ${C.yellow}${truncate(filename, 40)}${C.reset}` +
        `  ${C.gray}→ ${destination}${C.reset}`
      );
      logToFile('INFO', `Upload mulai: ${filename}`, { destination });
    },

    progress(filename, pct) {
      if (pct % 25 === 0) {
        console.log(
          `${ts()} ${C.magenta}↑${C.reset}  UPLOAD ${String(pct).padStart(3)}%` +
          `  ${C.gray}${truncate(filename, 50)}${C.reset}`
        );
      }
    },

    done(filename, filecode) {
      console.log(
        `${ts()} ${C.green}✔${C.reset}  ${C.bold}${C.green}UPLOAD SELESAI${C.reset}` +
        `  ${C.yellow}${truncate(filename, 40)}${C.reset}` +
        `  ${C.gray}filecode: ${filecode}${C.reset}`
      );
      logToFile('INFO', `Upload selesai: ${filename}`, { filecode });
    },

    fail(filename, error) {
      console.log(
        `${ts()} ${C.red}✖${C.reset}  UPLOAD GAGAL` +
        `  ${C.yellow}${truncate(filename, 40)}${C.reset}` +
        `  ${C.gray}${truncate(error, 60)}${C.reset}`
      );
      logToFile('WARN', `Upload gagal: ${filename}`, { error });
    },
  },

  queue(action, url, chatId, count) {
    const short = truncate(url, 50);
    console.log(
      `${ts()} ${C.cyan}≡${C.reset}  QUEUE ${action.toUpperCase().padEnd(6)}` +
      `  ${C.gray}chat:${chatId}  [${count}]  ${short}${C.reset}`
    );
    logToFile('INFO', `Queue ${action}: ${url}`, { chatId, count });
  },

  user(action, chatId, username) {
    const name = username ? `@${username}` : `#${chatId}`;
    console.log(
      `${ts()} ${C.blue}👤${C.reset} ${name}  ${C.gray}${action}${C.reset}`
    );
    logToFile('INFO', `User ${action}`, { chatId, username });
  },
};

function truncate(str, max) {
  if (!str) return '';
  str = String(str);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

module.exports = logger;
