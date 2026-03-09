const logger = require('../utils/logger');

/**
 * Simple async queue implementation
 * Supports put (enqueue) dan get (dequeue with await)
 */
class AsyncQueue {
  /**
   * @param {number} maxSize - Maximum queue size
   */
  constructor(maxSize) {
    this._maxSize = maxSize;
    this._items = [];
    this._waiters = [];
  }

  /**
   * Get current queue size
   * @returns {number}
   */
  get size() {
    return this._items.length;
  }

  /**
   * Check if queue is full
   * @returns {boolean}
   */
  get full() {
    return this._items.length >= this._maxSize;
  }

  /**
   * Add item to queue
   * @param {*} item - Item to add
   * @returns {boolean} - True jika berhasil ditambahkan
   */
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

  /**
   * Get next item dari queue (await jika kosong)
   * @returns {Promise<*>}
   */
  get() {
    if (this._items.length) {
      return Promise.resolve(this._items.shift());
    }
    return new Promise(resolve => {
      this._waiters.push(() => resolve(this._items.shift()));
    });
  }

  /**
   * Clear semua items
   */
  clear() {
    this._items = [];
    this._waiters = [];
    logger.info('Queue di-clear');
  }

  /**
   * Get queue info untuk debugging
   * @returns {Object}
   */
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
