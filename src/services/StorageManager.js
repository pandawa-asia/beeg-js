'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');
const { normalizeDir } = require('../utils/helpers');
const { StorageError } = require('../errors/AppError');

const CLEANABLE_EXTENSIONS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.m4v', '.ts', '.part']);

function scanDirRecursive(dir, callback) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirRecursive(fullPath, callback);
      } else if (entry.isFile()) {
        callback(fullPath);
      }
    }
  } catch {}
}

class StorageManager {
  constructor() {
    this.downloadDir = '';
    this.folderHistory = new Map();
  }

  initialize(dir) {
    try {
      const normalized = normalizeDir(dir || config.DOWNLOAD_DIR_DEFAULT);
      fs.mkdirSync(normalized, { recursive: true });
      this.downloadDir = normalized;
      logger.info('Storage initialized', { directory: normalized });
    } catch (error) {
      throw new StorageError(`Gagal initialize storage: ${error.message}`);
    }
  }

  applyDownloadDir(newDir, chatId = null) {
    try {
      const normalized = normalizeDir(newDir);
      fs.mkdirSync(normalized, { recursive: true });
      this.downloadDir = normalized;

      if (chatId) {
        const key = String(chatId);
        const hist = this.folderHistory.get(key) || [];
        const idx = hist.indexOf(normalized);
        if (idx !== -1) hist.splice(idx, 1);
        hist.unshift(normalized);
        this.folderHistory.set(key, hist.slice(0, config.MAX_FOLDER_HISTORY));
      }

      logger.info('Download directory berubah', { directory: normalized });
    } catch (error) {
      throw new StorageError(`Gagal mengubah directory: ${error.message}`);
    }
  }

  getFolderHistory(chatId) {
    return this.folderHistory.get(String(chatId)) || [];
  }

  cleanupOldFiles(days = config.CLEANUP_DAYS) {
    const baseDir = config.BASE_DIR;
    if (!fs.existsSync(baseDir)) return 0;

    const cutoff = Date.now() - days * 86400 * 1000;
    let removed = 0;

    scanDirRecursive(baseDir, (filepath) => {
      const ext = path.extname(filepath).toLowerCase();
      if (!CLEANABLE_EXTENSIONS.has(ext)) return;
      try {
        if (fs.statSync(filepath).mtimeMs < cutoff) {
          fs.unlinkSync(filepath);
          removed++;
          logger.debug(`File lama dihapus: ${filepath}`);
        }
      } catch (error) {
        logger.warn(`Gagal hapus file: ${filepath}`, { error: error.message });
      }
    });

    if (removed > 0) {
      logger.info(`Cleanup: ${removed} file dihapus (>${days} hari)`);
    }
    return removed;
  }

  getDownloadDir() {
    return this.downloadDir;
  }

  getDiskUsageMb() {
    const baseDir = config.BASE_DIR;
    if (!fs.existsSync(baseDir)) return 0;
    let totalBytes = 0;
    scanDirRecursive(baseDir, (filepath) => {
      try { totalBytes += fs.statSync(filepath).size; } catch {}
    });
    return totalBytes / (1024 * 1024);
  }
}

module.exports = StorageManager;
