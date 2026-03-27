'use strict';

const fs = require('fs');
const logger = require('../utils/logger');

const STATE_FILE = 'remote_upload_state.json';

class RemoteUploadState {
  constructor() {
    this._jobs = new Map();
    this._waitingFile = new Set();
    this._fileLists = new Map();
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(STATE_FILE)) return;
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      const jobs = data.jobs || [];
      for (const job of jobs) {
        if (job.filecode) {
          this._jobs.set(job.filecode, job);
        }
      }
      if (this._jobs.size > 0) {
        logger.info(`Remote upload state dimuat: ${this._jobs.size} job`, {});
      }
    } catch (e) {
      logger.error('Gagal load remote upload state', { error: e.message });
    }
  }

  _save() {
    const tmpFile = STATE_FILE + '.tmp';
    try {
      const jobs = [...this._jobs.values()];
      fs.writeFileSync(tmpFile, JSON.stringify({ jobs }, null, 2));
      fs.renameSync(tmpFile, STATE_FILE);
    } catch (e) {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
      logger.error('Gagal simpan remote upload state', { error: e.message });
    }
  }

  addJob({ filecode, url }) {
    this._jobs.set(filecode, { filecode, url, addedAt: new Date().toISOString() });
    this._save();
  }

  getJob(filecode) {
    return this._jobs.get(filecode) || null;
  }

  removeJob(filecode) {
    const deleted = this._jobs.delete(filecode);
    if (deleted) this._save();
  }

  getAllJobs() {
    return [...this._jobs.values()];
  }

  setWaitingFile(chatId, waiting) {
    if (waiting) {
      this._waitingFile.add(chatId);
    } else {
      this._waitingFile.delete(chatId);
    }
  }

  isWaitingFile(chatId) {
    return this._waitingFile.has(chatId);
  }

  setFileList(chatId, folderName, files) {
    this._fileLists.set(String(chatId), { folderName, files });
  }

  getFileList(chatId) {
    return this._fileLists.get(String(chatId)) || null;
  }

  clearFileList(chatId) {
    this._fileLists.delete(String(chatId));
  }
}

module.exports = RemoteUploadState;
