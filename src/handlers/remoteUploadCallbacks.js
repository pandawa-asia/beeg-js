'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const {
  addRemoteUpload,
  removeRemoteUpload,
  checkRemoteStatus,
  getUploadServer,
  uploadLocalFile,
  getByseFileUrl,
  getOrCreateFolder,
  setFileFolder,
  getAccountInfo,
  getFileInfo,
  getEncodingStatus,
} = require('../services/ByseRemoteUpload');
const {
  getRemoteUploadMenuKeyboard,
  getRemoteUploadStatusKeyboard,
  getRemoteUploadDeleteKeyboard,
  getBackKeyboardTo,
  getLocalUploadFolderKeyboard,
  getLocalUploadFilesKeyboard,
} = require('./keyboards');
const uploadHistory = require('../services/UploadHistory');

const BYSE_BASE_DIR = 'Downloads';
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.m4v', '.ts', '.wmv', '.m2ts']);

function getApiKey() {
  return process.env.BYSE_API_KEY || '';
}

function extractUrlsFromText(text) {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const matches = trimmed.match(urlRegex);
    if (matches) urls.push(...matches.map(u => u.replace(/[.,;]+$/, '')));
  }
  return [...new Set(urls)];
}

async function downloadFileContent(fileUrl, redirectCount = 0) {
  if (redirectCount > 5) throw new Error('Terlalu banyak redirect');
  const { default: https } = await import('https');
  const { default: http } = await import('http');
  return new Promise((resolve, reject) => {
    const lib = fileUrl.startsWith('https') ? https : http;
    const req = lib.get(fileUrl, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadFileContent(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Download file timeout')); });
    req.on('error', reject);
  });
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function makeProgressBar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function scanFolders() {
  if (!fs.existsSync(BYSE_BASE_DIR)) return [];
  return fs.readdirSync(BYSE_BASE_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

function scanVideoFiles(folderName) {
  const dir = path.join(BYSE_BASE_DIR, folderName);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase()))
    .map(e => {
      const filepath = path.join(dir, e.name);
      let size = 0;
      try { size = fs.statSync(filepath).size; } catch {}
      return { name: e.name, filepath, size };
    })
    .sort((a, b) => b.size - a.size);
}

function remoteUploadMenuText(jobs, accountInfo = null) {
  const accountLine = accountInfo
    ? `\n📧 *Akun:* \`${accountInfo.email || '-'}\`\n💾 *Storage:* ${formatBytes(accountInfo.storage_used || 0)} digunakan`
    : '';
  return (
    '☁️ *REMOTE UPLOAD BYSE*\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    accountLine + '\n\n' +
    `📦 *Job tercatat:* ${jobs.length}\n\n` +
    'Pilih metode upload ke Byse:\n' +
    '• *File .txt* — kirim URL video langsung ke Byse _(remote)_\n' +
    '• *Upload Lokal* — upload file dari `Downloads/` ke Byse\n\n' +
    'Pilih aksi:'
  );
}

function statusEmoji(statusStr) {
  const s = (statusStr || '').toUpperCase();
  if (['OK', 'DONE', 'TRANSFERRED', 'FINISHED'].includes(s)) return '✅';
  if (s === 'WORKING') return '⚙️';
  if (s === 'PENDING') return '⏳';
  if (s === 'ERROR' || s === 'FAILED') return '❌';
  return '❓';
}

function registerRemoteUploadHandlers(bot, remoteUploadState) {
  if (!getApiKey()) {
    logger.warn('BYSE_API_KEY tidak diset — fitur Remote Upload Byse dinonaktifkan');
  }

  bot.action('remote_upload_menu', async ctx => {
    try {
      await ctx.answerCbQuery();
      const jobs = remoteUploadState.getAllJobs();
      const apiKey = getApiKey();

      let accountInfo = null;
      if (apiKey) {
        const infoRes = await getAccountInfo(apiKey).catch(() => null);
        if (infoRes && infoRes.ok) accountInfo = infoRes.data;
      }

      await ctx.editMessageText(
        remoteUploadMenuText(jobs, accountInfo),
        { parse_mode: 'Markdown', ...getRemoteUploadMenuKeyboard(jobs) }
      );
    } catch (e) { logger.error('remote_upload_menu error', { error: e.message }); }
  });

  bot.action('remote_add_from_file', async ctx => {
    try {
      const chatId = ctx.chat.id;
      await ctx.answerCbQuery();
      remoteUploadState.setWaitingFile(chatId, true);
      await ctx.reply(
        '📎 *Tambah Remote Upload*\n\n' +
        'Kirim file `.txt` berisi URL video, satu URL per baris.\n\n' +
        '_Contoh isi file:_\n`https://site.com/video1.mp4`\n`https://site.com/video2.mkv`',
        { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') }
      );
    } catch (e) { logger.error('remote_add_from_file error', { error: e.message }); }
  });

  bot.action('remote_status_menu', async ctx => {
    try {
      await ctx.answerCbQuery();
      const jobs = remoteUploadState.getAllJobs();
      if (jobs.length === 0) {
        await ctx.editMessageText(
          '📋 *Status Remote Upload*\n\nBelum ada job remote upload yang tercatat.',
          { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') }
        );
        return;
      }
      await ctx.editMessageText(
        '📋 *Pilih job untuk cek status:*',
        { parse_mode: 'Markdown', ...getRemoteUploadStatusKeyboard(jobs) }
      );
    } catch (e) { logger.error('remote_status_menu error', { error: e.message }); }
  });

  bot.action(/^remote_check\|(.+)$/, async ctx => {
    try {
      const fileCode = ctx.match[1];
      await ctx.answerCbQuery('Mengecek status...');

      const apiKey = getApiKey();
      if (!apiKey) {
        await ctx.editMessageText('❌ `BYSE_API_KEY` belum diset.', { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') });
        return;
      }

      const job = remoteUploadState.getJob(fileCode);
      const isLocalUpload = job && job.url.startsWith('local:');
      const urlShort = job
        ? (isLocalUpload ? `📁 ${job.url.slice(6)}` : (job.url.length > 50 ? job.url.slice(0, 50) + '…' : job.url))
        : fileCode;

      if (isLocalUpload) {
        const [fileRes, encRes] = await Promise.all([
          getFileInfo(apiKey, fileCode),
          getEncodingStatus(apiKey, fileCode),
        ]);

        if (!fileRes.ok) {
          await ctx.editMessageText(
            `❌ *Gagal cek file* \`${fileCode}\`\n\n_${fileRes.error}_`,
            { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') }
          );
          return;
        }

        const f = fileRes.data;
        const canPlay = f.canplay === 1 || f.canplay === '1';
        const encData = encRes.ok ? encRes.data : null;

        let encLine = '';
        if (encData) {
          const encStatus = encData.status || encData.encode_progress || '';
          encLine = `\n⚙️ *Encoding:* \`${encStatus}\``;
        } else if (canPlay) {
          encLine = `\n⚙️ *Encoding:* \`Selesai ✅\``;
        }

        const fileUrl = await getByseFileUrl(apiKey, fileCode);
        const linkLine = fileUrl ? `\n🔗 *Link:* ${fileUrl}` : '';

        await ctx.editMessageText(
          `📋 *Status File Lokal*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🔑 *File Code:* \`${fileCode}\`\n` +
          `📁 *File:* \`${urlShort}\`\n\n` +
          `${canPlay ? '✅' : '⏳'} *Bisa Diputar:* ${canPlay ? 'Ya' : 'Belum (sedang encoding)'}\n` +
          `👁️ *Views:* ${f.views || '0'}\n` +
          `⏱️ *Durasi:* ${f.length ? f.length + 's' : 'N/A'}\n` +
          `📅 *Upload:* ${f.uploaded || 'N/A'}` +
          encLine +
          linkLine,
          { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') }
        );
      } else {
        const result = await checkRemoteStatus(apiKey, fileCode);

        if (!result.ok) {
          await ctx.editMessageText(
            `❌ *Gagal cek status* \`${fileCode}\`\n\n_${result.error}_`,
            { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') }
          );
          return;
        }

        const d = result.data;
        const emoji = statusEmoji(d.status);
        const fileUrl = result.isDone ? await getByseFileUrl(apiKey, fileCode) : null;
        const linkLine = fileUrl ? `\n🔗 *Link:* ${fileUrl}` : '';
        const errorLine = d.error_msg ? `\n⚠️ *Error:* \`${d.error_msg}\`` : '';

        await ctx.editMessageText(
          `📋 *Status Remote Upload*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🔑 *File Code:* \`${fileCode}\`\n` +
          `📁 *Sumber:* \`${urlShort}\`\n\n` +
          `${emoji} *Status:* \`${d.status || 'UNKNOWN'}\`\n` +
          `📊 *Progress:* ${d.progress || 'N/A'}\n` +
          `🕐 *Dibuat:* ${d.created || 'N/A'}\n` +
          `🔄 *Update:* ${d.updated || 'N/A'}` +
          errorLine +
          linkLine,
          { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') }
        );
      }
    } catch (e) { logger.error('remote_check error', { error: e.message }); }
  });

  bot.action('remote_delete_menu', async ctx => {
    try {
      await ctx.answerCbQuery();
      const jobs = remoteUploadState.getAllJobs();
      if (jobs.length === 0) {
        await ctx.editMessageText(
          '🗑️ *Hapus Remote Upload*\n\nBelum ada job yang tersimpan.',
          { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') }
        );
        return;
      }
      await ctx.editMessageText(
        '🗑️ *Pilih job yang ingin dihapus dari antrian Byse:*',
        { parse_mode: 'Markdown', ...getRemoteUploadDeleteKeyboard(jobs) }
      );
    } catch (e) { logger.error('remote_delete_menu error', { error: e.message }); }
  });

  bot.action(/^remote_del\|(.+)$/, async ctx => {
    try {
      const fileCode = ctx.match[1];
      await ctx.answerCbQuery('Menghapus...');

      const apiKey = getApiKey();
      if (!apiKey) {
        await ctx.editMessageText('❌ `BYSE_API_KEY` belum diset.', { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') });
        return;
      }

      const result = await removeRemoteUpload(apiKey, fileCode);
      remoteUploadState.removeJob(fileCode);

      const jobs = remoteUploadState.getAllJobs();
      await ctx.editMessageText(
        result.ok
          ? `✅ *Berhasil dihapus dari antrian Byse*\n\`${fileCode}\``
          : `⚠️ *Respons Byse:* ${result.msg}\n\`${fileCode}\` dihapus dari catatan lokal.`,
        { parse_mode: 'Markdown', ...getRemoteUploadMenuKeyboard(jobs) }
      );
    } catch (e) { logger.error('remote_del error', { error: e.message }); }
  });

  bot.action('local_upload_folder', async ctx => {
    try {
      await ctx.answerCbQuery();

      const apiKey = getApiKey();
      if (!apiKey) {
        await ctx.editMessageText('❌ `BYSE_API_KEY` belum diset di environment.', { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') });
        return;
      }

      const folders = scanFolders();
      if (folders.length === 0) {
        await ctx.editMessageText(
          '📂 *Upload Lokal ke Byse*\n\nBelum ada folder di `Downloads/`.\nDownload video dulu kemudian coba lagi.',
          { parse_mode: 'Markdown', ...getBackKeyboardTo('remote_upload_menu') }
        );
        return;
      }

      await ctx.editMessageText(
        '📂 *Pilih Folder*\n\nPilih folder dari `Downloads/` yang ingin di-upload ke Byse:',
        { parse_mode: 'Markdown', ...getLocalUploadFolderKeyboard(folders) }
      );
    } catch (e) { logger.error('local_upload_folder error', { error: e.message }); }
  });

  bot.action(/^lu_folder\|(.+)$/, async ctx => {
    try {
      const folderName = ctx.match[1];
      await ctx.answerCbQuery();

      const files = scanVideoFiles(folderName);
      if (files.length === 0) {
        await ctx.editMessageText(
          `📂 *${folderName}*\n\nTidak ada file video di folder ini.`,
          { parse_mode: 'Markdown', ...getBackKeyboardTo('local_upload_folder') }
        );
        return;
      }

      remoteUploadState.setFileList(ctx.chat.id, folderName, files);

      const totalSize = files.reduce((s, f) => s + f.size, 0);
      const filesSummary = files.slice(0, 15).map((f, i) => {
        const name = f.name.length > 38 ? f.name.slice(0, 38) + '…' : f.name;
        return `${i + 1}\\. \`${name}\` _(${formatBytes(f.size)})_`;
      }).join('\n');

      await ctx.editMessageText(
        `📂 *Folder: ${folderName}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📹 *${files.length} file* · Total ${formatBytes(totalSize)}\n\n` +
        filesSummary +
        (files.length > 15 ? `\n_...dan ${files.length - 15} file lainnya_` : '') +
        '\n\nPilih file atau upload semua sekaligus:',
        { parse_mode: 'Markdown', ...getLocalUploadFilesKeyboard(files, folderName) }
      );
    } catch (e) { logger.error('lu_folder error', { error: e.message }); }
  });

  bot.action(/^lu_file\|(\d+)$/, async ctx => {
    try {
      const chatId = ctx.chat.id;
      const idx = parseInt(ctx.match[1], 10);
      await ctx.answerCbQuery('Upload dimulai di background...');

      const apiKey = getApiKey();
      if (!apiKey) {
        await ctx.reply('❌ `BYSE_API_KEY` belum diset.', { parse_mode: 'Markdown' });
        return;
      }

      const fileList = remoteUploadState.getFileList(chatId);
      if (!fileList || !fileList.files[idx]) {
        await ctx.reply('❌ File tidak ditemukan. Pilih folder lagi.');
        return;
      }

      const file = fileList.files[idx];
      performLocalUpload(ctx.telegram, chatId, [file], remoteUploadState).catch(e =>
        logger.error('performLocalUpload error', { error: e.message })
      );
    } catch (e) { logger.error('lu_file error', { error: e.message }); }
  });

  bot.action(/^lu_all\|(.+)$/, async ctx => {
    try {
      const chatId = ctx.chat.id;
      await ctx.answerCbQuery('Upload semua dimulai di background...');

      const apiKey = getApiKey();
      if (!apiKey) {
        await ctx.reply('❌ `BYSE_API_KEY` belum diset.', { parse_mode: 'Markdown' });
        return;
      }

      const fileList = remoteUploadState.getFileList(chatId);
      if (!fileList || fileList.files.length === 0) {
        await ctx.reply('❌ Tidak ada file. Pilih folder lagi.');
        return;
      }

      performLocalUpload(ctx.telegram, chatId, fileList.files, remoteUploadState).catch(e =>
        logger.error('performLocalUpload error', { error: e.message })
      );
    } catch (e) { logger.error('lu_all error', { error: e.message }); }
  });

  async function performLocalUpload(telegram, chatId, files, ruState) {
    const apiKey = getApiKey();

    const serverRes = await getUploadServer(apiKey);
    if (!serverRes.ok) {
      await telegram.sendMessage(chatId,
        `❌ *Gagal mendapatkan upload server Byse*\n\`${serverRes.error}\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const serverUrl = serverRes.serverUrl;
    const totalFiles = files.length;
    const totalSize = files.reduce((s, f) => s + f.size, 0);

    const statusMsg = await telegram.sendMessage(chatId,
      `📤 *Upload Lokal ke Byse*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 ${totalFiles} file · ${formatBytes(totalSize)}\n` +
      `⏳ Menyiapkan...`,
      { parse_mode: 'Markdown' }
    );

    const results = [];
    let done = 0;
    let skipped = 0;

    async function editStatus(text) {
      try {
        await telegram.editMessageText(chatId, statusMsg.message_id, null, text, { parse_mode: 'Markdown' });
      } catch {}
    }

    for (const file of files) {
      const shortName = file.name.length > 35 ? file.name.slice(0, 35) + '…' : file.name;
      done++;

      const existing = uploadHistory.find(file.name, file.size);
      if (existing) {
        skipped++;
        logger.info('Upload dilewati — sudah pernah diupload', { filename: file.name, filecode: existing.filecode });
        results.push(
          `⏭️ \`${shortName}\`\n` +
          `   _(sudah diupload ${new Date(existing.uploadedAt).toLocaleDateString('id-ID')})_\n` +
          `   🔑 \`${existing.filecode}\`\n` +
          (existing.link ? `   🔗 ${existing.link}` : '')
        );
        continue;
      }

      await editStatus(
        `📤 *Upload Lokal ke Byse*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📦 ${totalFiles} file · ${formatBytes(totalSize)}\n` +
        `⏫ *[${done}/${totalFiles}]* Mengupload...\n\n` +
        `📹 \`${shortName}\`\n` +
        `💾 ${formatBytes(file.size)}\n\n` +
        `${makeProgressBar(0)} \`0%\``
      );

      logger.upload.start(file.name, 'Byse');

      let lastTgUpdate = 0;

      try {
        const res = await uploadLocalFile(serverUrl, apiKey, file.filepath, async (pct, uploaded, total) => {
          logger.upload.progress(file.name, pct);
          const now = Date.now();
          if (now - lastTgUpdate >= 4000) {
            lastTgUpdate = now;
            await editStatus(
              `📤 *Upload Lokal ke Byse*\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `📦 ${totalFiles} file · ${formatBytes(totalSize)}\n` +
              `⏫ *[${done}/${totalFiles}]* Mengupload...\n\n` +
              `📹 \`${shortName}\`\n` +
              `💾 ${formatBytes(uploaded)} / ${formatBytes(total)}\n\n` +
              `${makeProgressBar(pct)} \`${pct}%\``
            ).catch(() => {});
          }
        });

        if (res.ok) {
          ruState.addJob({ filecode: res.filecode, url: `local:${file.name}` });

          const folderName = path.basename(path.dirname(file.filepath));
          if (folderName && folderName !== '.' && folderName !== BYSE_BASE_DIR) {
            const fld_id = await getOrCreateFolder(apiKey, folderName);
            if (fld_id) {
              const moved = await setFileFolder(apiKey, res.filecode, fld_id);
              if (!moved) logger.warn('File gagal dipindah ke folder Byse', { filecode: res.filecode, folderName });
            }
          }

          const fileUrl = await getByseFileUrl(apiKey, res.filecode);

          uploadHistory.add({
            filename: file.name,
            sizeBytes: file.size,
            filecode: res.filecode,
            link: fileUrl,
            folder: folderName
          });

          try {
            fs.unlinkSync(file.filepath);
            logger.info('File lokal dihapus setelah upload sukses', { filepath: file.filepath });
          } catch (e) {
            logger.warn('Gagal hapus file lokal', { filepath: file.filepath, error: e.message });
          }

          results.push(
            `✅ \`${shortName}\`\n` +
            `   🔑 \`${res.filecode}\`\n` +
            (fileUrl ? `   🔗 ${fileUrl}` : '')
          );
          logger.upload.done(file.name, res.filecode);
        } else {
          results.push(`❌ Gagal — \`${shortName}\`\n   _${res.error}_`);
          logger.upload.fail(file.name, res.error);
        }
      } catch (e) {
        results.push(`❌ Error — \`${shortName}\`\n   _${e.message}_`);
        logger.upload.fail(file.name, e.message);
      }
    }

    const successCount = results.filter(r => r.startsWith('✅')).length;
    const failCount = results.filter(r => r.startsWith('❌')).length;

    const summary =
      `📤 *Hasil Upload Lokal ke Byse*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✅ Berhasil: *${successCount}*   ❌ Gagal: *${failCount}*   ⏭️ Dilewati: *${skipped}*\n\n` +
      results.slice(0, 20).join('\n') +
      (results.length > 20 ? `\n_...dan ${results.length - 20} lainnya_` : '');

    await editStatus(summary).catch(async () => {
      await telegram.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
    });
  }

  const handleDocument = async (ctx) => {
    const chatId = ctx.chat.id;
    if (!remoteUploadState.isWaitingFile(chatId)) return false;

    remoteUploadState.setWaitingFile(chatId, false);

    const doc = ctx.message.document;
    if (!doc) return false;

    const mimeOk = doc.mime_type === 'text/plain' || (doc.file_name || '').toLowerCase().endsWith('.txt');
    if (!mimeOk) {
      await ctx.reply('❌ Harap kirim file `.txt` berisi URL.', { parse_mode: 'Markdown' });
      return true;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      await ctx.reply('❌ `BYSE_API_KEY` belum diset di environment.', { parse_mode: 'Markdown' });
      return true;
    }

    let fileUrl;
    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      fileUrl = fileLink.href || fileLink.toString();
    } catch (e) {
      await ctx.reply('❌ Gagal mendapatkan link file dari Telegram.', { parse_mode: 'Markdown' });
      return true;
    }

    let content;
    try {
      content = await downloadFileContent(fileUrl);
    } catch (e) {
      await ctx.reply('❌ Gagal mengunduh isi file dari Telegram.', { parse_mode: 'Markdown' });
      return true;
    }

    const urls = extractUrlsFromText(content);
    if (urls.length === 0) {
      await ctx.reply('❌ Tidak ada URL yang valid ditemukan dalam file.', { parse_mode: 'Markdown' });
      return true;
    }

    const statusMsg = await ctx.reply(
      `📤 *Mengirim ${urls.length} URL ke Byse...*\n⏳ Mohon tunggu...`,
      { parse_mode: 'Markdown' }
    );

    let success = 0;
    let failed = 0;
    const results = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      if (i % 5 === 0) {
        try {
          await ctx.telegram.editMessageText(
            chatId, statusMsg.message_id, null,
            `📤 *Mengirim URL ke Byse...*\n` +
            `${makeProgressBar(Math.round((i / urls.length) * 100))} \`${i}/${urls.length}\``,
            { parse_mode: 'Markdown' }
          );
        } catch {}
      }

      const res = await addRemoteUpload(apiKey, url);
      const shortUrl = url.length > 45 ? url.slice(0, 45) + '…' : url;

      if (res.ok) {
        success++;
        remoteUploadState.addJob({ filecode: res.filecode, url });

        const defaultFolder = process.env.DOWNLOAD_DIR || null;
        if (defaultFolder) {
          const fld_id = await getOrCreateFolder(apiKey, defaultFolder);
          if (fld_id) await setFileFolder(apiKey, res.filecode, fld_id);
        }

        results.push(
          `✅ \`${shortUrl}\`\n` +
          `   🔑 \`${res.filecode}\``
        );
      } else {
        failed++;
        results.push(`❌ Gagal — \`${shortUrl}\`\n   _${res.error}_`);
      }
    }

    const summary =
      `📤 *Hasil Remote Upload ke Byse*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✅ Berhasil: *${success}*   ❌ Gagal: *${failed}*\n\n` +
      results.slice(0, 20).join('\n') +
      (results.length > 20 ? `\n_...dan ${results.length - 20} lainnya_` : '') +
      (success > 0 ? '\n\n_Gunakan menu Status untuk cek progress upload._' : '');

    try {
      await ctx.telegram.editMessageText(chatId, statusMsg.message_id, null, summary, { parse_mode: 'Markdown' });
    } catch {
      await ctx.reply(summary, { parse_mode: 'Markdown' });
    }

    return true;
  };

  return { handleDocument };
}

module.exports = { registerRemoteUploadHandlers };
