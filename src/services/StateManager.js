'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config');
const { StorageError } = require('../errors/AppError');

const MAX_PROCESSED_LINKS = 2000;

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
    this._autoSaveTimer = null;
  }

  startAutoSave(intervalMs = 5 * 60 * 1000, getDownloadDir) {
    if (this._autoSaveTimer) return;
    this._autoSaveTimer = setInterval(() => {
      try {
        this.saveState(getDownloadDir());
        logger.debug('Auto-save state berhasil');
      } catch (err) {
        logger.warn('Auto-save state gagal', { error: err.message });
      }
    }, intervalMs);
    this._autoSaveTimer.unref();
  }

  stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  loadState() {
    try {
      if (!fs.existsSync(this.stateFile)) {
        logger.info('State file tidak ada, membuat baru');
        return '';
      }

      const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));

      const links = data.processed_links || [];
      const trimmed = links.slice(-MAX_PROCESSED_LINKS);
      trimmed.forEach(l => this.processedLinks.add(l));

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

  saveState(downloadDir) {
    const tmpFile = this.stateFile + '.tmp';
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

      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
      fs.renameSync(tmpFile, this.stateFile);
      logger.debug('State disimpan', { processedLinks: this.processedLinks.size });
    } catch (error) {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
      logger.error('Gagal save state', { error: error.message });
      throw new StorageError(`Gagal menyimpan state: ${error.message}`);
    }
  }

  _trimProcessedLinks() {
    if (this.processedLinks.size > MAX_PROCESSED_LINKS) {
      const arr = [...this.processedLinks];
      const keep = arr.slice(arr.length - MAX_PROCESSED_LINKS);
      this.processedLinks = new Set(keep);
    }
  }

  clearProcessedLinks() {
    const count = this.processedLinks.size;
    this.processedLinks.clear();
    logger.info(`${count} processed links dihapus`);
    return count;
  }

  isProcessed(url) {
    return this.processedLinks.has(url);
  }

  addProcessedLink(url) {
    this.processedLinks.add(url);
    this._trimProcessedLinks();
  }

  removeProcessedLink(url) {
    this.processedLinks.delete(url);
  }

  updateStats(updates) {
    Object.assign(this.downloadStats, updates);
  }

  getStats() {
    return {
      ...this.downloadStats,
      uptime: (Date.now() - new Date(this.downloadStats.start_time).getTime()) / 1000
    };
  }

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
