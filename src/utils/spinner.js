const ora = require('ora');

/**
 * Create a download spinner for a worker
 * @param {string} filename - Filename being downloaded
 * @param {string} folder - Target folder
 * @param {number} workerId - Worker ID
 * @returns {Object} spinner controller
 */
function createDownloadSpinner(filename, folder, workerId) {
  const spinner = ora({
    text: `[Worker-${workerId}] Memulai download: ${filename}`,
    spinner: 'dots',
    color: 'cyan',
  }).start();

  return {
    update(percentage, speed, eta) {
      const filled = Math.floor(percentage / 5);
      const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
      spinner.text = `[Worker-${workerId}] ${bar} ${percentage.toFixed(0)}%  ${speed}  ETA ${eta}  →  ${filename}`;
    },

    succeed(sizeStr) {
      spinner.succeed(`[Worker-${workerId}] ✅ Selesai  ${sizeStr}  →  ${filename}  (${folder})`);
    },

    fail(reason) {
      spinner.fail(`[Worker-${workerId}] ❌ Gagal: ${reason}  →  ${filename}`);
    },

    retry(attempt) {
      spinner.text = `[Worker-${workerId}] 🔄 Retry ${attempt}...  →  ${filename}`;
    }
  };
}

module.exports = { createDownloadSpinner };
