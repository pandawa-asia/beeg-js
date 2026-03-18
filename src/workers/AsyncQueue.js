'use strict';

const logger = require('../utils/logger');

class AsyncQueue {
  constructor(maxSize) {
    this._maxSize = maxSize;
    this._items = [];
    this._waiters = [];
  }

  get size() {
    return this._items.length;
  }

  get full() {
    return this._items.length >= this._maxSize;
  }

  put(item) {
    if (this.full) {
      logger.warn('Queue penuh, item ditolak', { queueSize: this._items.length });
      return false;
    }
    this._items.push(item);
    if (this._waiters.length) {
      this._waiters.shift()();
    }
    logger.debug('Item ditambahkan ke queue', { queueSize: this._items.length });
    return true;
  }

  get() {
    if (this._items.length) {
      return Promise.resolve(this._items.shift());
    }
    return new Promise(resolve => {
      this._waiters.push(() => resolve(this._items.shift()));
    });
  }

  clear() {
    this._items = [];
    const waiters = this._waiters.splice(0);
    for (const resolve of waiters) {
      resolve(undefined);
    }
    logger.info('Queue di-clear');
  }

  getInfo() {
    return {
      size: this._items.length,
      full: this.full,
      maxSize: this._maxSize,
      waiters: this._waiters.length
    };
  }
}

module.exports = AsyncQueue;
