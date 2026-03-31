/**
 * Base application error class
 */
class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Error code untuk categorization
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Download error - untuk download-related failures
 */
class DownloadError extends AppError {
  constructor(message, code = 'DOWNLOAD_FAILED') {
    super(message, 400, code);
    this.name = 'DownloadError';
  }
}

/**
 * Validation error - untuk input validation failures
 */
class ValidationError extends AppError {
  constructor(message, code = 'VALIDATION_FAILED') {
    super(message, 400, code);
    this.name = 'ValidationError';
  }
}

/**
 * Storage error - untuk file system operations
 */
class StorageError extends AppError {
  constructor(message, code = 'STORAGE_ERROR') {
    super(message, 500, code);
    this.name = 'StorageError';
  }
}

/**
 * Configuration error - untuk config issues
 */
class ConfigError extends AppError {
  constructor(message, code = 'CONFIG_ERROR') {
    super(message, 500, code);
    this.name = 'ConfigError';
  }
}

module.exports = {
  AppError,
  DownloadError,
  ValidationError,
  StorageError,
  ConfigError
};
