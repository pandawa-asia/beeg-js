const { formatDuration } = require('./helpers');

/**
 * Format queue result message
 * @param {number} added - Jumlah link ditambahkan
 * @param {number} dupes - Jumlah duplikat
 * @param {boolean} full - Apakah queue penuh
 * @param {string} folder - Target folder
 * @returns {string}
 */
function formatQueueResult(added, dupes, full, folder) {
  let result = `✅ *${added} link* dimasukkan antrian\n💾 Folder: \`${folder}\`\n`;
  if (dupes) result += `⏭️ Duplikat dilewati: ${dupes}\n`;
  if (full) result += `⚠️ Beberapa link gagal (antrian penuh)\n`;
  result += `📊 Posisi antrian: ${downloadQueue?.size || 0}`;
  return result;
}

/**
 * Format progress bar
 * @param {number} pct - Percentage
 * @returns {string}
 */
function formatProgressBar(pct) {
  return '█'.repeat(Math.floor(pct / 4)) + '░'.repeat(25 - Math.floor(pct / 4));
}

/**
 * Format download status message
 * @param {string} filename - Filename
 * @param {string} folder - Folder path
 * @param {boolean} success - Success status
 * @param {string} status - Status message
 * @returns {string}
 */
function formatDownloadStatus(filename, folder, success, status) {
  if (success) {
    return (
      `✅ *Download Berhasil!*\n` +
      `📁 \`${filename}\`\n` +
      `💾 \`${folder}\`\n` +
      `ℹ️ ${status}`
    );
  }
  return (
    `❌ *Download Gagal*\n` +
    `📁 \`${filename}\`\n` +
    `⚠️ ${status}\n\n` +
    `🔁 Link sudah dihapus dari cache, kirim ulang untuk retry.`
  );
}

module.exports = {
  formatQueueResult,
  formatProgressBar,
  formatDownloadStatus
};
