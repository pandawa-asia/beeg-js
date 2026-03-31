'use strict';

const { formatUptime } = require('../utils/helpers');

function shortUrl(url, max = 45) {
  return url.length > max ? url.slice(0, max) + '…' : url;
}

function queueBar(size, max, width = 10) {
  const filled = Math.min(width, Math.round((size / Math.max(max, 1)) * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const templates = {
  home: (downloadDir, queueSize, failedCount = 0) => {
    const folderInfo = downloadDir ? `\`${downloadDir}\`` : '_belum diset_';
    const queueInfo = queueSize > 0
      ? `📋 *Antrian:* ${queueSize} item menunggu`
      : `📋 *Antrian:* Kosong`;
    const failedLine = failedCount > 0
      ? `\n🔴 *${failedCount} download gagal* — tekan tombol merah untuk retry`
      : '';
    return (
      '🎬 *Video Downloader Bot*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📁 *Folder aktif:* ${folderInfo}\n` +
      `${queueInfo}${failedLine}\n\n` +
      'Kirim link video kapan saja untuk download,\natau gunakan menu di bawah 👇'
    );
  },

  stats: (stats, downloadDir, maxWorkers, queueSize) => {
    const total = stats.success + stats.failed;
    const rate = total ? (stats.success / total * 100) : 0;
    const startStr = stats.start_time
      ? new Date(stats.start_time).toLocaleString('id-ID', {
          day: '2-digit', month: '2-digit', year: '2-digit',
          hour: '2-digit', minute: '2-digit'
        })
      : 'N/A';
    const rateEmoji = rate >= 90 ? '🟢' : rate >= 60 ? '🟡' : '🔴';

    const ul = stats.upload || { success: 0, failed: 0, totalBytes: 0 };
    const ulTotal = ul.success + ul.failed;
    const ulRate = ulTotal ? (ul.success / ulTotal * 100) : 0;
    const ulRateEmoji = ulRate >= 90 ? '🟢' : ulRate >= 60 ? '🟡' : '🔴';
    const ulBytes = ul.totalBytes || 0;
    const ulSizeStr = ulBytes >= 1024 * 1024 * 1024
      ? `${(ulBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
      : `${(ulBytes / (1024 * 1024)).toFixed(1)} MB`;

    return (
      '📊 *STATISTIK DOWNLOAD*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `✅ *Berhasil:*    ${stats.success}\n` +
      `❌ *Gagal:*       ${stats.failed}\n` +
      `📈 *Total:*       ${total}\n` +
      `${rateEmoji} *Sukses Rate:* ${rate.toFixed(1)}%\n\n` +
      `📋 *Antrian:*     ${queueSize} item\n` +
      `👷 *Workers:*     ${maxWorkers} aktif\n` +
      `📁 *Folder:*      \`${downloadDir || 'belum diset'}\`\n\n` +
      `⏱️ *Uptime:*      ${formatUptime(stats.uptime || 0)}\n` +
      `🕐 *Mulai:*       ${startStr}\n\n` +
      '☁️ *STATISTIK UPLOAD (Byse)*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `✅ *Berhasil:*    ${ul.success}\n` +
      `❌ *Gagal:*       ${ul.failed}\n` +
      `📈 *Total:*       ${ulTotal}\n` +
      `${ulRateEmoji} *Sukses Rate:* ${ulTotal ? ulRate.toFixed(1) : '—'}%\n` +
      `💾 *Terupload:*   ${ulBytes > 0 ? ulSizeStr : '—'}`
    );
  },

  queue: (queueSize, maxWorkers, maxQueueSize, activeDownloads, uploadQueueSize = 0, uploadWorkers = 0) => {
    const bar    = queueBar(queueSize, maxQueueSize);
    const ulBar  = queueBar(uploadQueueSize, maxQueueSize);
    let text = (
      '📋 *STATUS ANTRIAN*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      '⬇️ *Download*\n' +
      `\`${bar}\` ${queueSize}/${maxQueueSize}\n` +
      `📦 *Antrian:*      ${queueSize} item\n` +
      `👷 *Workers:*      ${maxWorkers}\n` +
      `📊 *Kapasitas:*    ${maxQueueSize}\n` +
      `📈 *Slot kosong:*  ${Math.max(0, maxQueueSize - queueSize)}\n\n` +
      '☁️ *Upload (Byse)*\n' +
      `\`${ulBar}\` ${uploadQueueSize}/${maxQueueSize}\n` +
      `📦 *Antrian:*      ${uploadQueueSize} item\n` +
      `👷 *Workers:*      ${uploadWorkers}\n\n`
    );

    if (activeDownloads.length) {
      text += `⚡ *Sedang didownload (${activeDownloads.length}):*\n`;
      activeDownloads.slice(0, 5).forEach((f, i) => {
        const s = f.length > 38 ? f.slice(0, 38) + '…' : f;
        text += `  ${i + 1}\\. \`${s}\`\n`;
      });
      if (activeDownloads.length > 5) {
        text += `  _...dan ${activeDownloads.length - 5} lainnya_`;
      }
    } else {
      text += '✨ _Tidak ada download aktif saat ini_';
    }
    return text;
  },

  help: (downloadDir, maxQueueSize, maxWorkers, maxRetries, cleanupDays) => {
    return (
      '❓ *PANDUAN PENGGUNAAN*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      '*📥 Download Video:*\n' +
      'Kirim satu atau beberapa link video ke chat ini.\n' +
      'Bot akan tanya folder tujuan, lalu download otomatis.\n\n' +
      '*📁 Pilih Folder:*\n' +
      '• Gunakan folder aktif yang sudah dipilih\n' +
      '• Pilih dari riwayat folder terakhir\n' +
      '• Atau ketik nama folder baru\n\n' +
      '*☁️ Remote Upload Byse:*\n' +
      '• *File .txt* — kirim URL langsung ke Byse (tanpa download lokal)\n' +
      '• *Upload Lokal* — upload video di `Downloads/` ke Byse\n\n' +
      '*🔴 Download Gagal:*\n' +
      '• Muncul otomatis jika ada yang gagal\n' +
      '• Retry per-link atau retry semua sekaligus\n\n' +
      '*🗑️ Kelola Cache:*\n' +
      '• *Hapus Semua* — semua link bisa download ulang\n' +
      '• *Hapus Tertentu* — kirim link yang ingin dihapus\n\n' +
      '*⚙️ Konfigurasi saat ini:*\n' +
      `• Folder     : \`${downloadDir || 'belum diset'}\`\n` +
      `• Max antrian: ${maxQueueSize}\n` +
      `• Workers    : ${maxWorkers}\n` +
      `• Retry max  : ${maxRetries}×\n` +
      `• Cleanup    : file >${cleanupDays} hari otomatis dihapus`
    );
  },

  cacheMenu: (cacheSize) => {
    return (
      '🗑️ *KELOLA CACHE LINK*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📦 *Link di cache:* ${cacheSize} link\n\n` +
      'Cache mencegah link yang sama didownload dua kali.\n' +
      'Hapus cache jika ingin download ulang link yang sama.\n\n' +
      'Pilih aksi:'
    );
  },

  failedMenu: (items) => {
    if (items.length === 0) {
      return '✅ *Tidak Ada Download Gagal*\n\nSemua download berhasil! 🎉';
    }

    let text = (
      '🔴 *DOWNLOAD GAGAL*\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📦 *${items.length} link gagal* — pilih untuk retry atau hapus\n\n`
    );

    items.slice(0, 8).forEach((item, i) => {
      const name = (item.filename || 'unknown').length > 35
        ? (item.filename || 'unknown').slice(0, 35) + '…'
        : (item.filename || 'unknown');
      const time = item.time ? new Date(item.time).toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      }) : '??';
      const reason = (item.reason || 'Error tidak diketahui').slice(0, 80);
      text += `*${i + 1}.* \`${name}\`\n`;
      text += `   ⚠️ _${reason}_\n`;
      text += `   🕐 ${time}\n\n`;
    });

    if (items.length > 8) {
      text += `_...dan ${items.length - 8} link lainnya_\n\n`;
    }

    text += 'Gunakan tombol di bawah untuk retry atau hapus:';
    return text;
  },

  downloadStart: (filename, folder, queueSize) => {
    const name = filename.length > 45 ? filename.slice(0, 45) + '…' : filename;
    const antrian = queueSize > 0 ? `\n📊 Antrian: ${queueSize} menunggu` : '';
    return (
      `⏬ *Memulai Download*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📹 \`${name}\`\n` +
      `📁 Folder: \`${folder}\`` +
      antrian
    );
  },

  downloadDone: (filename, folder, status) => {
    const name = filename.length > 45 ? filename.slice(0, 45) + '…' : filename;
    return (
      `✅ *Download Selesai!*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📹 \`${name}\`\n` +
      `📁 \`${folder}\`\n` +
      `📊 ${status}`
    );
  },

  downloadFailed: (filename, reason) => {
    const name = filename.length > 45 ? filename.slice(0, 45) + '…' : filename;
    const shortReason = reason.length > 120 ? reason.slice(0, 120) + '…' : reason;
    return (
      `❌ *Download Gagal*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📹 \`${name}\`\n\n` +
      `⚠️ _${shortReason}_\n\n` +
      `_Buka menu 🔴 Gagal untuk retry._`
    );
  },
};

module.exports = templates;
