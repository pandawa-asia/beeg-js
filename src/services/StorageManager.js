const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');
const { sanitizeFoldername } = require('../utils/validators');
const { normalizeDir } = require('../utils/helpers');
const { StorageError } = require('../errors/AppError');

/**
 * Manager untuk folder dan file operations
 */
class StorageManager {
  constructor() {
    this.downloadDir = '';
    this.folderHistory = new Map();
  }

  /**
   * Initialize storage dengan given directory
   * @param {string} dir - Directory path
   */
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

  /**
   * Apply/change download directory
   * @param {string} newDir - New directory name
   * @param {string|number} chatId - Chat ID for history
   */
  applyDownloadDir(newDir, chatId = null) {
    try {
      const normalized = normalizeDir(newDir);
      fs.mkdirSync(normalized, { recursive: true });
      this.downloadDir = normalized;

      // Update history
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

  /**
   * Get folder history untuk user
   * @param {string|number} chatId - Chat ID
   * @returns {string[]}
   */
  getFolderHistory(chatId) {
    return this.folderHistory.get(String(chatId)) || [];
  }

  /**
   * Cleanup old files (> X days)
   * @param {number} days - Days threshold
   * @returns {number} - Jumlah file yang dihapus
   */
  cleanupOldFiles(days = config.CLEANUP_DAYS) {
    if (!this.downloadDir) return 0;

    const cutoff = Date.now() - days * 86400 * 1000;
    let removed = 0;

    try {
      fs.readdirSync(this.downloadDir)
        .filter(f => f.endsWith('.mp4'))
        .forEach(f => {
          const fp = path.join(this.downloadDir, f);
          try {
            if (fs.statSync(fp).mtimeMs < cutoff) {
              fs.unlinkSync(fp);
              removed++;
            }
          } catch (error) {
            logger.warn(`Gagal hapus file: ${f}`, { error: error.message });
          }
        });

      if (removed > 0) {
        logger.info(`${removed} file dihapus (>${days} hari)`);
      }
      return removed;
    } catch (error) {
      logger.error('Cleanup old files gagal', { error: error.message });
      return 0;
    }
  }

  /**
   * Get current download directory
   * @returns {string}
   */
  getDownloadDir() {
    return this.downloadDir;
  }
}

module.exports = StorageManager;
