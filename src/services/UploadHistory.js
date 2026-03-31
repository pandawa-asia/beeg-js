'use strict';

const fs = require('fs');
const logger = require('../utils/logger');

const HISTORY_FILE = 'upload_history.json';
const MAX_RECORDS = 5000;

class UploadHistory {
  constructor() {
    this._records = new Map();
    this.load();
  }

  _makeKey(filename, sizeBytes) {
    return `${filename}::${sizeBytes}`;
  }

  load() {
    try {
      if (!fs.existsSync(HISTORY_FILE)) {
        logger.info('Upload history file tidak ada, membuat baru');
        return;
      }
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      const records = data.records || [];
      for (const r of records) {
        this._records.set(r.key, r);
      }
      logger.info(`Upload history dimuat: ${this._records.size} record`);
    } catch (e) {
      logger.error('Gagal load upload history', { error: e.message });
    }
  }

  save() {
    const tmpFile = HISTORY_FILE + '.tmp';
    try {
      const records = [...this._records.values()];
      fs.writeFileSync(tmpFile, JSON.stringify({ records }, null, 2));
      fs.renameSync(tmpFile, HISTORY_FILE);
      logger.debug('Upload history disimpan', { total: records.length });
    } catch (e) {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
      logger.error('Gagal save upload history', { error: e.message });
    }
  }

  find(filename, sizeBytes) {
    const key = this._makeKey(filename, sizeBytes);
    return this._records.get(key) || null;
  }

  add({ filename, sizeBytes, filecode, link, folder }) {
    const key = this._makeKey(filename, sizeBytes);
    this._records.set(key, {
      key,
      filename,
      sizeBytes,
      filecode,
      link,
      folder,
      uploadedAt: new Date().toISOString()
    });

    if (this._records.size > MAX_RECORDS) {
      const oldest = [...this._records.keys()].slice(0, this._records.size - MAX_RECORDS);
      oldest.forEach(k => this._records.delete(k));
    }

    this.save();
  }

  remove(filename, sizeBytes) {
    const key = this._makeKey(filename, sizeBytes);
    const deleted = this._records.delete(key);
    if (deleted) this.save();
    return deleted;
  }

  get size() {
    return this._records.size;
  }
}

module.exports = new UploadHistory();
