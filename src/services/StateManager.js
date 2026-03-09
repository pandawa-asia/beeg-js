const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');
const { StorageError } = require('../errors/AppError');

/**
 * Manager untuk bot state persistence
 */
class StateManager {
  constructor(stateFile = config.STATE_FILE) {
    this.stateFile = stateFile;
    this.processedLinks = new Set();
    this.folderHistory = new Map();
    this.downloadStats = {
      success: 0,
      failed: 0,
      total: 0,
      start_time: new Date()
    };
  }

  /**
   * Load state dari file
   * @returns {string} - Download directory dari state
   */
  loadState() {
    try {
      if (!fs.existsSync(this.stateFile)) {
        logger.info('State file tidak ada, membuat baru');
        return '';
      }

      const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      
      (data.processed_links || []).forEach(l => this.processedLinks.add(l));
      
      const hist = data.folder_history || {};
      Object.entries(hist).forEach(([k, v]) => this.folderHistory.set(k, v));
      
      const s = data.stats || {};
      if (s.success !== undefined) this.downloadStats.success = s.success;
      if (s.failed !== undefined) this.downloadStats.failed = s.failed;
      if (s.total !== undefined) this.downloadStats.total = s.total;

      logger.info(`State dimuat: ${this.processedLinks.size} link processed`, {
        downloadDir: data.download_dir
      });
      
      return data.download_dir || '';
    } catch (error) {
      logger.error('Gagal load state file', { error: error.message });
      return '';
    }
  }

  /**
   * Save state ke file
   * @throws {StorageError}
   */
  saveState(downloadDir) {
    try {
      const data = {
        processed_links: [...this.processedLinks],
        download_dir: downloadDir,
        folder_history: Object.fromEntries(this.folderHistory),
        stats: {
          success: this.downloadStats.success,
          failed: this.downloadStats.failed,
          total: this.downloadStats.total
        }
      };

      fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
      logger.debug('State disimpan', { processedLinks: this.processedLinks.size });
    } catch (error) {
      logger.error('Gagal save state', { error: error.message });
      throw new StorageError(`Gagal menyimpan state: ${error.message}`);
    }
  }

  /**
   * Clear processed links
   * @returns {number} - Jumlah link yang dihapus
   */
  clearProcessedLinks() {
    const count = this.processedLinks.size;
    this.processedLinks.clear();
    logger.info(`${count} processed links dihapus`);
    return count;
  }

  /**
   * Check apakah link sudah diproses
   * @param {string} url - URL to check
   * @returns {boolean}
   */
  isProcessed(url) {
    return this.processedLinks.has(url);
  }

  /**
   * Add link ke processed set
   * @param {string} url - URL to add
   */
  addProcessedLink(url) {
    this.processedLinks.add(url);
  }

  /**
   * Remove link dari processed set
   * @param {string} url - URL to remove
   */
  removeProcessedLink(url) {
    this.processedLinks.delete(url);
  }

  /**
   * Update download stats
   * @param {Object} updates - Stats to update
   */
  updateStats(updates) {
    Object.assign(this.downloadStats, updates);
  }

  /**
   * Get stats
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.downloadStats,
      uptime: (Date.now() - this.downloadStats.start_time.getTime()) / 1000
    };
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.downloadStats = {
      success: 0,
      failed: 0,
      total: 0,
      start_time: new Date()
    };
    logger.info('Stats direset');
  }
}

module.exports = StateManager;
