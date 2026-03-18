'use strict';

const { formatUptime } = require('../utils/helpers');

function shortUrl(url, max = 45) {
  return url.length > max ? url.slice(0, max) + '…' : url;
}

const templates = {
  home: (downloadDir, queueSize, failedCount = 0) => {
    const folderInfo = downloadDir ? `\`${downloadDir}\`` : '_belum diset_';
    const failedLine = failedCount > 0
      ? `🔴 *Gagal:* ${failedCount} link — tekan tombol merah di bawah untuk retry\n`
      : '';
    return (
      '🎬 *Video Downloader Bot*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📁 *Folder aktif:* ${folderInfo}\n` +
      `📋 *Antrian:* ${queueSize} item\n` +
      failedLine +
      '\nKirim link video kapan saja,\natau pilih menu di bawah 👇'
    );
  },

  stats: (stats, downloadDir, maxWorkers, queueSize) => {
    const uptime = stats.uptime || 0;
    const total = stats.success + stats.failed;
    const rate = total ? (stats.success / total * 100) : 0;
    const startStr = stats.start_time
      ? new Date(stats.start_time).toLocaleString('id-ID')
      : 'N/A';
    return (
      '📊 *STATISTIK DOWNLOAD*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `✅ *Berhasil:*    ${stats.success}\n` +
      `❌ *Gagal:*       ${stats.failed}\n` +
      `📈 *Total:*       ${total}\n` +
      `🎯 *Sukses Rate:* ${rate.toFixed(1)}%\n\n` +
      `📋 *Antrian:*     ${queueSize}\n` +
      `👷 *Workers:*     ${maxWorkers}\n` +
      `📁 *Folder:*      \`${downloadDir || 'belum diset'}\`\n\n` +
      `⏱️ *Uptime:*      ${formatUptime(uptime)}\n` +
      `🕐 *Start:*       ${startStr}`
    );
  },

  queue: (queueSize, maxWorkers, maxQueueSize, activeDownloads) => {
    let text = (
      '📋 *STATUS ANTRIAN*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📦 *Total Antrian:* ${queueSize}\n` +
      `👷 *Worker Aktif:*  ${maxWorkers}\n` +
      `📊 *Kapasitas:*     ${maxQueueSize}\n` +
      `📈 *Slot Tersisa:*  ${Math.max(0, maxQueueSize - queueSize)}\n\n`
    );

    if (activeDownloads.length) {
      text += '⚡ *Sedang Diproses:*\n';
      activeDownloads.slice(0, 5).forEach((f, i) => {
        const s = f.length > 35 ? f.slice(0, 35) + '…' : f;
        text += `\`${i + 1}.\` \`${s}\`\n`;
      });
      if (activeDownloads.length > 5) {
        text += `_...dan ${activeDownloads.length - 5} lainnya_`;
      }
    } else {
      text += '✨ _Tidak ada download aktif_';
    }
    return text;
  },

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
      '*🔴 Download Gagal:*\n' +
      '• Tampil otomatis jika ada yang gagal\n' +
      '• Bisa retry per-link atau retry semua sekaligus\n' +
      '• Link yang di-retry dimasukkan ke antrian kembali\n\n' +
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

  failedMenu: (items) => {
    if (items.length === 0) {
      return (
        '✅ *Tidak Ada Download Gagal*\n\n' +
        'Semua download berhasil!'
      );
    }

    let text = (
      '🔴 *DOWNLOAD GAGAL*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📦 *Total gagal:* ${items.length}\n\n`
    );

    items.slice(0, 8).forEach((item, i) => {
      const name = item.filename || 'unknown';
      const url  = shortUrl(item.url);
      const time = item.time ? new Date(item.time).toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      }) : '??';
      text += `*${i + 1}.* \`${name}\`\n`;
      text += `   🔗 ${url}\n`;
      text += `   ⚠️ ${item.reason || 'Error tidak diketahui'}\n`;
      text += `   🕐 ${time}\n\n`;
    });

    if (items.length > 8) {
      text += `_...dan ${items.length - 8} link lainnya_\n\n`;
    }

    text += 'Pilih aksi atau tekan tombol per-link:';
    return text;
  },

  downloadStart: (filename, folder, queueSize) => {
    return (
      `⏬ *Memulai download...*\n` +
      `📁 \`${filename}\`\n` +
      `💾 Folder: \`${folder}\`\n` +
      `📊 Antrian: ${queueSize}`
    );
  },

  downloadDone: (filename, folder, status) => {
    return (
      `✅ *Download Selesai!*\n` +
      `📁 \`${filename}\`\n` +
      `💾 Folder: \`${folder}\`\n` +
      `📊 ${status}`
    );
  },

  downloadFailed: (filename, reason) => {
    return (
      `❌ *Download Gagal*\n` +
      `📁 \`${filename}\`\n` +
      `⚠️ ${reason}\n\n` +
      `_Cek menu 🔴 Gagal untuk retry._`
    );
  },

  changeFolder: (currentFolder) => {
    const folderInfo = currentFolder ? `\`${currentFolder}\`` : '_belum diset_';
    return (
      `📁 *Ganti Folder Aktif*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📌 Saat ini: ${folderInfo}\n\n` +
      `Pilih folder atau buat baru:`
    );
  },

  customFolderPrompt: () => {
    return (
      '✏️ *Ketik nama folder baru:*\n\n' +
      'Contoh: `VideoKoleksi`, `Film_2024`\n\n' +
      '⚠️ Hindari: `/ \\ : * ? " < > |`'
    );
  },

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
