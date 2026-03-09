const config = require('../config');

/**
 * Message templates untuk bot responses
 */
const templates = {
  /**
   * Home/menu screen
   */
  home: (downloadDir, queueSize) => {
    const folderInfo = downloadDir ? `\`${downloadDir}\`` : '_belum diset_';
    return (
      '🎬 *Video Downloader Bot*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📁 *Folder aktif:* ${folderInfo}\n` +
      `📋 *Antrian:* ${queueSize} item\n\n` +
      'Kirim link video kapan saja,\natau pilih menu di bawah 👇'
    );
  },

  /**
   * Statistics page
   */
  stats: (stats, downloadDir, maxWorkers, queueSize) => {
    const uptime = stats.uptime || 0;
    const total = stats.success + stats.failed;
    const rate = total ? (stats.success / total * 100) : 0;
    return (
      '📊 *STATISTIK DOWNLOAD*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `✅ *Berhasil:*    ${stats.success}\n` +
      `❌ *Gagal:*       ${stats.failed}\n` +
      `📈 *Total:*       ${total}\n` +
      `🎯 *Sukses Rate:* ${rate.toFixed(1)}%\n\n` +
      `📋 *Antrian:*     ${queueSize}\n` +
      `👷 *Workers:*     ${maxWorkers}\n` +
      `📁 *Folder:*      \`${downloadDir || 'belum diset'}\`\n` +
      `🔗 *Cache Links:* [lihat di /cache]\n\n` +
      `⏱️ *Uptime:*      [${uptime}s]\n` +
      `🕐 *Start:*       ${stats.start_time?.toLocaleString?.('id-ID') || 'N/A'}`
    );
  },

  /**
   * Queue status page
   */
  queue: (queueSize, maxWorkers, maxQueueSize, activeDownloads) => {
    let text = (
      '📋 *STATUS ANTRIAN*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📦 *Total Antrian:* ${queueSize}\n` +
      `👷 *Worker Aktif:*  ${maxWorkers}\n` +
      `📊 *Kapasitas:*     ${maxQueueSize}\n` +
      `📈 *Slot Tersisa:*  ${maxQueueSize - queueSize}\n\n`
    );

    if (activeDownloads.length) {
      text += '⚡ *Sedang Diproses:*\n';
      activeDownloads.slice(0, 5).forEach((f, i) => {
        const s = f.length > 35 ? f.slice(0, 35) + '…' : f;
        text += `\`${i + 1}.\` \`${s}\`\n`;
      });
    } else {
      text += '✨ _Tidak ada download aktif_';
    }
    return text;
  },

  /**
   * Help/usage guide
   */
  help: (downloadDir, maxQueueSize, maxWorkers, maxRetries, cleanupDays) => {
    return (
      '❓ *PANDUAN PENGGUNAAN*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      '*📥 Download Video:*\n' +
      'Kirim link video ke chat ini.\n' +
      'Bot akan tanya folder tujuan, lalu download otomatis.\n\n' +
      '*📁 Folder:*\n' +
      '• Pilih folder aktif yang sudah ada\n' +
      '• Pilih dari riwayat folder terakhir\n' +
      '• Atau ketik nama folder baru\n\n' +
      '*🗑️ Kelola Cache:*\n' +
      '• *Hapus Semua* — semua link bisa download ulang\n' +
      '• *Hapus Link Tertentu* — kirim link yang ingin dihapus\n' +
      '• Link yang *gagal* otomatis dihapus dari cache\n\n' +
      '*⚙️ Spesifikasi:*\n' +
      `• Folder aktif : \`${downloadDir || 'belum diset'}\`\n` +
      `• Max antrian  : ${maxQueueSize}\n` +
      `• Workers      : ${maxWorkers}\n` +
      `• Retry        : ${maxRetries}×\n` +
      `• Auto-cleanup : >${cleanupDays} hari`
    );
  },

  /**
   * Cache management page
   */
  cacheMenu: (cacheSize) => {
    return (
      '🗑️ *KELOLA CACHE LINK*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📦 *Link di cache:* ${cacheSize}\n\n` +
      'Cache mencegah link yang sama didownload dua kali.\n' +
      'Hapus jika ingin download ulang link lama.\n\n' +
      'Pilih aksi:'
    );
  },

  /**
   * Download starting message
   */
  downloadStart: (filename, folder, queueSize) => {
    return (
      `⏬ *Memulai download...*\n` +
      `📁 \`${filename}\`\n` +
      `💾 Folder: \`${folder}\`\n` +
      `📊 Antrian: ${queueSize}`
    );
  },

  /**
   * Change folder page
   */
  changeFolder: (currentFolder) => {
    const folderInfo = currentFolder ? `\`${currentFolder}\`` : '_belum diset_';
    return (
      `📁 *Ganti Folder Aktif*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📌 Saat ini: ${folderInfo}\n\n` +
      `Pilih folder atau buat baru:`
    );
  },

  /**
   * Custom folder input prompt
   */
  customFolderPrompt: () => {
    return (
      '✏️ *Ketik nama folder baru:*\n\n' +
      'Contoh: `VideoKoleksi`, `Film_2024`\n\n' +
      '⚠️ Hindari: `/ \\ : * ? " < > |`'
    );
  },

  /**
   * Remove link from cache prompt
   */
  removeLinkPrompt: () => {
    return (
      '✂️ *Hapus Link Tertentu dari Cache*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      'Kirim link yang ingin dihapus dari cache.\n' +
      'Bisa kirim beberapa link sekaligus (satu per baris).\n\n' +
      '_Tekan Selesai untuk keluar dari mode ini._'
    );
  }
};

module.exports = templates;
