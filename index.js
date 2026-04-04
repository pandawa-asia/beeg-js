#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');
const logger = require('./src/utils/logger');
const dashboard = require('./src/utils/dashboard');
const config = require('./src/config');
const { requireAuth } = require('./src/handlers/auth');
const { registerCallbackHandlers } = require('./src/handlers/callbacks');
const { registerRemoteUploadHandlers, uploadSingleFileToByse } = require('./src/handlers/remoteUploadCallbacks');
const {
  getMainInlineKeyboard,
  buildFolderChoiceKeyboard,
  buildGlobalFolderKeyboard,
  getPersistentMenuKeyboard
} = require('./src/handlers/keyboards');
const AsyncQueue = require('./src/workers/AsyncQueue');
const StateManager = require('./src/services/StateManager');
const StorageManager = require('./src/services/StorageManager');
const DownloadService = require('./src/services/DownloadService');
const RemoteUploadState = require('./src/services/RemoteUploadState');
const templates = require('./src/messages/templates');
const { extractLinks } = require('./src/utils/helpers');
const { sanitizeFoldername } = require('./src/utils/validators');
const { isBeegProfileUrl, isBeegVideoUrl: isBeegVideo, getSlugFromUrl, scrapeAllVideos, fetchBeegVideoTitle } = require('./src/services/BeegScraper');
const { isMaxPornUrl, isMaxPornChannelUrl, getChannelSlug, scrapeChannelVideos, resolveMaxPornUrl } = require('./src/services/MaxPornScraper');
const { isTikTokProfileUrl, isTikTokVideoUrl, getProfileSlug, scrapeTikTokProfile } = require('./src/services/TikTokScraper');

let botInstance = null;

// ── Telegram rate limiter ──────────────────────────────────────────────────
// Per-chatId: catat kapan boleh kirim lagi setelah kena 429
const rateLimitUntil = new Map(); // key: String(chatId) -> ms timestamp

// Antrian pesan penting (sendMessage) per chatId agar tidak hilang saat rate limit
const msgQueues   = new Map(); // key: String(chatId) -> Array<{text, extra}>
const msgRunning  = new Set(); // chatId yang sedang diproses

async function _drainMsgQueue(key) {
  const queue = msgQueues.get(key) || [];
  while (queue.length > 0) {
    const until = rateLimitUntil.get(key) || 0;
    const wait = until - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));

    const { text, extra } = queue.shift();
    try {
      await botInstance.telegram.sendMessage(parseInt(key), text, {
        parse_mode: 'Markdown', ...extra
      });
      // Jeda minimal 500ms antar pesan ke chat yang sama
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      const m = err.message?.match(/retry after (\d+)/i);
      if (m) {
        const retryMs = (parseInt(m[1], 10) + 1) * 1000;
        rateLimitUntil.set(key, Date.now() + retryMs);
        logger.warn(`Rate limit chat ${key}, tunggu ${Math.ceil(retryMs / 1000)}s`, {});
        // Kembalikan pesan ke depan antrian lalu tunggu
        queue.unshift({ text, extra });
      } else {
        logger.error('Gagal kirim pesan (queue)', { chatId: key, error: err.message });
      }
    }
  }
  msgRunning.delete(key);
}

function enqueueSendMessage(chatId, text, extra = {}) {
  if (!botInstance) return;
  const key = String(chatId);
  if (!msgQueues.has(key)) msgQueues.set(key, []);
  msgQueues.get(key).push({ text, extra });
  if (!msgRunning.has(key)) {
    msgRunning.add(key);
    _drainMsgQueue(key).catch(e =>
      logger.error('drainMsgQueue error', { chatId: key, error: e.message })
    );
  }
}
// ──────────────────────────────────────────────────────────────────────────

const downloadQueue = new AsyncQueue(config.MAX_QUEUE_SIZE);
const uploadQueue   = new AsyncQueue(config.MAX_QUEUE_SIZE);
const stateManager = new StateManager();
const storage = new StorageManager();
const remoteUploadState = new RemoteUploadState();
const activeDownloads = new Map();
const removeMode = new Map();
const pendingLinks = new Map();

// Stats upload (in-memory, reset saat bot restart)
const uploadStats = { success: 0, failed: 0, totalBytes: 0 };

// Shared rate-limit timestamp untuk semua upload workers (ms)
// Saat satu worker kena 429, kedua worker pause sampai batas ini
let uploadRateLimitUntil = 0;

// Map url → Set<chatId> untuk admin yang ingin dapat notifikasi
// tapi tidak perlu download ulang (karena sudah ada di antrian/sedang diproses)
const linkSubscribers = new Map();

const PENDING_QUEUE_FILE = path.join(process.cwd(), 'pending_downloads.json');
const BEEG_UPLOAD_QUEUE_FILE = path.join(process.cwd(), 'beeg_upload_queue.json');

const pendingDownloadItems = new Map();
const pendingUploadItems   = new Map();

function savePendingDownloads() {
  try {
    const items = [...pendingDownloadItems.values()];
    fs.writeFileSync(PENDING_QUEUE_FILE, JSON.stringify(items, null, 2));
  } catch (e) {
    logger.error('Gagal simpan pending_downloads.json', { error: e.message });
  }
}

function saveBeegUploadQueue() {
  try {
    const items = [...pendingUploadItems.values()];
    fs.writeFileSync(BEEG_UPLOAD_QUEUE_FILE, JSON.stringify(items, null, 2));
  } catch (e) {
    logger.error('Gagal simpan beeg_upload_queue.json', { error: e.message });
  }
}

// opts.direct = true  → kirim langsung & return msg (untuk download start, perlu message_id)
// opts.direct = false → masuk antrian (fire-and-forget, tidak pernah hilang)
async function sendTelegramMessage(chatId, text, messageId = null, extra = {}, opts = {}) {
  if (!botInstance) return null;
  const key = String(chatId);

  if (messageId) {
    // Progress edit: drop jika sedang rate limited
    const until = rateLimitUntil.get(key) || 0;
    if (Date.now() < until) return null;

    try {
      return await botInstance.telegram.editMessageText(
        chatId, messageId, null, text,
        { parse_mode: 'Markdown', ...extra }
      );
    } catch (error) {
      const m = error.message?.match(/retry after (\d+)/i);
      if (m) {
        rateLimitUntil.set(key, Date.now() + (parseInt(m[1], 10) + 1) * 1000);
        return null;
      }
      if (!error.message?.includes('message is not modified')) {
        logger.error('Gagal edit pesan', { chatId, error: error.message });
      }
    }
    return null;
  }

  if (opts.direct) {
    // Kirim langsung dan return (butuh message_id untuk progress edit)
    try {
      return await botInstance.telegram.sendMessage(chatId, text, {
        parse_mode: 'Markdown', ...extra
      });
    } catch (error) {
      const m = error.message?.match(/retry after (\d+)/i);
      if (m) {
        rateLimitUntil.set(key, Date.now() + (parseInt(m[1], 10) + 1) * 1000);
        logger.warn(`Rate limit saat kirim start message ke ${chatId}`);
      } else {
        logger.error('Gagal kirim pesan (direct)', { chatId, error: error.message });
      }
      return null;
    }
  }

  // Pesan penting (done/fail/notif) → masuk antrian, tidak pernah hilang
  enqueueSendMessage(chatId, text, extra);
  return null;
}

async function uploadWorkerLoop(workerId) {
  logger.debug(`UploadWorker-${workerId} started`);

  while (true) {
    try {
      // ── Cek rate limit bersama sebelum ambil item ──────────────────────
      const waitMs = uploadRateLimitUntil - Date.now();
      if (waitMs > 0) {
        logger.warn(`UploadWorker-${workerId} menunggu rate limit ${Math.ceil(waitMs / 1000)}s...`);
        await new Promise(r => setTimeout(r, waitMs));
      }

      const item = await uploadQueue.get();
      if (!item) continue;

      const { filepath, name, size, chatId } = item;
      const shortName = name.length > 45 ? name.slice(0, 45) + '…' : name;
      const sizeMB = (size / (1024 * 1024)).toFixed(1);

      dashboard.startJob(`U${workerId}`, name);
      logger.info(`UploadWorker-${workerId} mulai upload: ${name}`);

      sendTelegramMessage(
        chatId,
        `📤 *Upload ke Byse dimulai*\n📹 \`${shortName}\`\n💾 ${sizeMB} MB`
      );

      let requeued = false;
      try {
        await uploadSingleFileToByse(botInstance.telegram, chatId, { filepath, name, size }, remoteUploadState);
        uploadStats.success++;
        uploadStats.totalBytes += size || 0;
        stateManager.updateUploadStats({
          success:    stateManager.uploadStats.success + 1,
          totalBytes: stateManager.uploadStats.totalBytes + (size || 0)
        });
        dashboard.finishJob(`U${workerId}`, { success: true, filename: name, info: `${sizeMB} MB` });
        logger.info(`UploadWorker-${workerId} selesai: ${name}`);
      } catch (e) {
        const match429 = e.message?.match(/retry after (\d+)/i);
        if (match429) {
          // ── 429 Too Many Requests ──────────────────────────────────────
          const retryMs = (parseInt(match429[1], 10) + 1) * 1000;
          uploadRateLimitUntil = Date.now() + retryMs;
          logger.warn(
            `UploadWorker-${workerId} kena 429 — requeue "${name}", ` +
            `semua worker pause ${Math.ceil(retryMs / 1000)}s`
          );
          dashboard.finishJob(`U${workerId}`, {
            success: false,
            filename: name,
            info: `429 — retry ${Math.ceil(retryMs / 1000)}s`
          });
          // Kembalikan item ke antrian; JANGAN hapus dari pendingUploadItems
          uploadQueue.put(item);
          requeued = true;
        } else {
          // ── Error permanen (bukan 429) ─────────────────────────────────
          uploadStats.failed++;
          stateManager.updateUploadStats({ failed: stateManager.uploadStats.failed + 1 });
          logger.error(`UploadWorker-${workerId} gagal: ${name}`, { error: e.message });
          sendTelegramMessage(
            chatId,
            `❌ *Gagal upload ke Byse*\n\`${shortName}\`\n_Error: ${e.message}_`
          );
          dashboard.finishJob(`U${workerId}`, { success: false, filename: name, info: e.message });
        }
      }

      // Hapus dari pending hanya jika berhasil atau error permanen (bukan requeue)
      if (!requeued) {
        pendingUploadItems.delete(filepath);
        saveBeegUploadQueue();
      }
    } catch (error) {
      logger.error(`UploadWorker-${workerId} error`, { error: error.message });
      dashboard.finishJob(`U${workerId}`, { success: false, filename: '???', info: error.message });
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

function addSubscriber(url, chatId) {
  if (!linkSubscribers.has(url)) linkSubscribers.set(url, new Set());
  linkSubscribers.get(url).add(chatId);
}

function flushSubscribers(url) {
  const subs = linkSubscribers.get(url);
  linkSubscribers.delete(url);
  return subs ? [...subs] : [];
}

function queueLinksToDownload(links, chatId, folder, opts = {}) {
  let added = 0, dupes = 0, inProgress = 0, alreadyDone = 0, full = false;
  const names = opts.names || {};

  for (const link of links) {
    if (stateManager.isProcessed(link)) {
      if (pendingDownloadItems.has(link)) {
        // Sedang dalam antrian / diproses — daftarkan sebagai subscriber
        const existing = pendingDownloadItems.get(link);
        if (String(existing.chatId) !== String(chatId)) {
          addSubscriber(link, chatId);
          inProgress++;
        } else {
          dupes++;
        }
      } else {
        // Sudah selesai didownload sebelumnya
        alreadyDone++;
      }
      continue;
    }

    const fromBeeg = isBeegVideo(link);
    const name = names[link] || null;
    stateManager.addProcessedLink(link);
    const ok = downloadQueue.put({ url: link, name, chatId, folder, fromBeeg });

    if (!ok) {
      full = true;
      stateManager.removeProcessedLink(link);
      break;
    }
    added++;
    stateManager.updateStats({ total: stateManager.downloadStats.total + 1 });
    pendingDownloadItems.set(link, { url: link, name, chatId, folder, fromBeeg });
  }

  if (added > 0) savePendingDownloads();
  return { added, dupes, full, inProgress, alreadyDone };
}

async function workerLoop(workerId) {
  logger.debug(`Worker-${workerId} started`);

  while (true) {
    try {
      const item = await downloadQueue.get();
      if (!item) continue;

      const { url, name, chatId, folder, fromBeeg } = item;

      // Kalau name belum ada dan ini URL Beeg → fetch title dari API dulu
      let resolvedName = name;
      if (!resolvedName && isBeegVideo(url)) {
        resolvedName = await fetchBeegVideoTitle(url).catch(() => null);
        if (resolvedName) {
          const existing = pendingDownloadItems.get(url);
          if (existing) {
            existing.name = resolvedName;
            pendingDownloadItems.set(url, existing);
            savePendingDownloads();
          }
        }
      }

      // Untuk max.porn → resolve URL direct dulu sebelum download
      let downloadUrl = url;
      if (isMaxPornUrl(url)) {
        try {
          logger.info(`[MaxPorn] Resolving URL: ${url}`);
          const resolved = await resolveMaxPornUrl(url);
          downloadUrl = resolved.directUrl;
          if (!resolvedName && resolved.title) resolvedName = resolved.title;
          logger.info(`[MaxPorn] Resolved: ${downloadUrl.slice(0, 80)}`);
        } catch (e) {
          logger.error(`[MaxPorn] Gagal resolve URL: ${e.message}`);
          await sendTelegramMessage(
            chatId,
            `❌ *Gagal mengambil URL video dari max.porn*\n_${e.message}_\n\nCoba kirim URL langsung dari network inspector browser.`
          );
          pendingDownloadItems.delete(url);
          savePendingDownloads();
          stateManager.removeProcessedLink(url);
          continue;
        }
      }

      const filename = resolvedName || DownloadService.extractFilenameFromUrl(downloadUrl);

      const acts = activeDownloads.get(chatId) || [];
      acts.push(filename);
      activeDownloads.set(chatId, acts);

      dashboard.startJob(workerId, filename);
      logger.download.start(filename, folder, chatId, workerId);

      const msg = await sendTelegramMessage(
        chatId,
        templates.downloadStart(filename, folder, downloadQueue.size),
        null, {}, { direct: true }
      );
      const messageId = msg?.message_id || null;

      const onProgress = async (progress) => {
        dashboard.updateJob(workerId, {
          pct: progress.percentage,
          speed: progress.speed,
          eta: progress.eta
        });

        const bar = '█'.repeat(Math.floor(progress.percentage / 4)) +
                   '░'.repeat(25 - Math.floor(progress.percentage / 4));

        await sendTelegramMessage(
          chatId,
          `${progress.spinner} *Downloading...*\n` +
          `📁 \`${filename}\`\n` +
          `💾 Folder: \`${folder}\`\n\n` +
          `${bar}\n` +
          `\`${progress.percentage.toFixed(0)}%\` • \`${progress.speed}\` • ETA \`${progress.eta}\``,
          messageId
        );
      };

      const startTime = Date.now();
      const { ok, path: fp, status } = await DownloadService.downloadVideo(
        downloadUrl, filename, folder, chatId, onProgress
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      const al = activeDownloads.get(chatId) || [];
      const fi = al.indexOf(filename);
      if (fi !== -1) al.splice(fi, 1);
      activeDownloads.set(chatId, al);

      if (ok) {
        stateManager.updateStats({ success: stateManager.downloadStats.success + 1 });
        const infoClean = status.replace(/^[✅❌⚠️]\s*/, '');
        dashboard.finishJob(workerId, { success: true, filename, info: infoClean });
        logger.download.done(filename, folder, parseFloat(infoClean) || 0, elapsed, workerId);
        await sendTelegramMessage(
          chatId,
          templates.downloadDone(filename, folder, status),
          messageId
        );

        pendingDownloadItems.delete(url);
        savePendingDownloads();

        // Notifikasi subscriber lain yang menunggu link yang sama
        const subscribers = flushSubscribers(url);
        for (const subChatId of subscribers) {
          await sendTelegramMessage(
            subChatId,
            `✅ *Download selesai!*\n📹 \`${filename}\`\n💾 Folder: \`${folder}\`\n\n_File ini sudah diminta admin lain, jadi tidak didownload ulang._`
          );
        }

        if (fromBeeg && fp && process.env.BYSE_API_KEY) {
          let fileSize = 0;
          try { fileSize = fs.statSync(fp).size; } catch {}

          const uploadItem = { filepath: fp, name: filename, size: fileSize, chatId };
          const ok = uploadQueue.put(uploadItem);
          if (ok) {
            pendingUploadItems.set(fp, uploadItem);
            saveBeegUploadQueue();
            const queuePos = uploadQueue.size;
            const shortName = filename.length > 45 ? filename.slice(0, 45) + '…' : filename;
            await sendTelegramMessage(
              chatId,
              `☁️ *Antrian upload ke Byse*\n📹 \`${shortName}\`\n💾 ${(fileSize / (1024 * 1024)).toFixed(1)} MB\n🔢 Posisi antrian: *${queuePos}*`
            );
          } else {
            const shortName = filename.length > 45 ? filename.slice(0, 45) + '…' : filename;
            await sendTelegramMessage(
              chatId,
              `⚠️ *Antrian upload penuh*\n📹 \`${shortName}\`\n_File tidak dapat ditambahkan ke antrian upload saat ini._`
            );
          }
        }
      } else {
        pendingDownloadItems.delete(url);
        savePendingDownloads();
        stateManager.updateStats({ failed: stateManager.downloadStats.failed + 1 });
        stateManager.removeProcessedLink(url);
        stateManager.addFailedDownload({ url, filename, folder, chatId, reason: status });
        dashboard.finishJob(workerId, { success: false, filename, info: status });
        logger.download.fail(filename, status, workerId);
        await sendTelegramMessage(
          chatId,
          templates.downloadFailed(filename, status),
          messageId
        );

        // Notifikasi subscriber lain bahwa download gagal
        const subscribers = flushSubscribers(url);
        for (const subChatId of subscribers) {
          await sendTelegramMessage(
            subChatId,
            `❌ *Download gagal*\n📹 \`${filename}\`\n_Error: ${status}_\n\nKirim ulang link untuk mencoba lagi.`
          );
        }
      }

      stateManager.saveState(storage.getDownloadDir());
    } catch (error) {
      logger.error(`Worker-${workerId} error`, { error: error.message });
      dashboard.finishJob(workerId, { success: false, filename: '???', info: error.message });
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

function registerTextHandlers(bot, handleDocument) {
  bot.on('document', requireAuth(async ctx => {
    const handled = await handleDocument(ctx);
    if (!handled) {
      await ctx.reply('📎 File diterima, tapi tidak ada aksi yang menunggu file ini.');
    }
  }));

  bot.on('text', requireAuth(async ctx => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    try {
      if (text === '🏠 Menu Utama') {
        const failedCount = stateManager.getFailedDownloads(null).length;
        await ctx.reply(
          templates.home(storage.getDownloadDir(), downloadQueue.size, failedCount),
          { parse_mode: 'Markdown', ...getMainInlineKeyboard(failedCount) }
        );
        return;
      }

      if (removeMode.get(chatId)) {
        const links = extractLinks(text);
        if (!links.length) {
          await ctx.reply('❌ Tidak ada link yang ditemukan.');
          return;
        }

        const removed = [];
        const notFound = [];
        for (const link of links) {
          if (stateManager.isProcessed(link)) {
            stateManager.removeProcessedLink(link);
            removed.push(link);
          } else {
            notFound.push(link);
          }
        }
        stateManager.saveState(storage.getDownloadDir());

        const lines = ['✂️ *Hasil Hapus Cache*\n━━━━━━━━━━━━━━━━━━━━\n'];
        if (removed.length) lines.push(`✅ *${removed.length} link dihapus*`);
        if (notFound.length) lines.push(`⚠️ *${notFound.length} tidak ada di cache*`);

        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
        return;
      }

      const pend = pendingLinks.get(chatId) || {};
      if (pend.waiting_custom) {
        const folderName = sanitizeFoldername(text);
        if (!folderName) {
          await ctx.reply('❌ *Nama folder tidak valid.*', { parse_mode: 'Markdown' });
          return;
        }

        storage.applyDownloadDir(folderName, chatId);
        pendingLinks.delete(chatId);

        if (pend.global_folder) {
          await ctx.reply(
            `✅ *Folder Aktif Diubah*\n📁 \`${storage.getDownloadDir()}\``,
            { parse_mode: 'Markdown' }
          );
        } else {
          const links = pend.links || [];
          const { added, dupes, inProgress, alreadyDone } = queueLinksToDownload(links, chatId, storage.getDownloadDir(), { names: pend.names || {} });
          stateManager.saveState(storage.getDownloadDir());
          await ctx.reply(
            `✅ *${added} link masuk antrian*\n💾 \`${storage.getDownloadDir()}\`` +
            (inProgress ? `\n⏳ ${inProgress} link sedang diproses admin lain, akan notif saat selesai` : '') +
            (alreadyDone ? `\n✔️ ${alreadyDone} link sudah pernah didownload (hapus cache untuk download ulang)` : '') +
            (dupes ? `\n⚠️ ${dupes} duplikat dilewati` : '') +
            (added === 0 && !dupes && !inProgress && !alreadyDone ? '\n⚠️ Antrian penuh' : ''),
            { parse_mode: 'Markdown' }
          );
        }
        return;
      }

      const links = extractLinks(text);
      if (!links.length) {
        await ctx.reply('❌ Tidak ada link yang valid.', { parse_mode: 'Markdown' });
        return;
      }

      const beegProfileLinks  = links.filter(l => isBeegProfileUrl(l));
      const maxChannelLinks   = links.filter(l => isMaxPornChannelUrl(l));
      const tiktokProfiles    = links.filter(l => isTikTokProfileUrl(l));
      const normalLinks       = links.filter(l =>
        !isBeegProfileUrl(l) && !isMaxPornChannelUrl(l) && !isTikTokProfileUrl(l)
      );

      let allLinks = [...normalLinks];
      const allNames = {};

      // ── Max.porn channel scrape ──────────────────────────────────────────
      for (const channelUrl of maxChannelLinks) {
        const slug = getChannelSlug(channelUrl);
        const scrapingMsg = await ctx.reply(
          `🔍 *Mengambil semua video dari channel max.porn...*\n📺 Channel: \`${slug}\`\n⏳ Mohon tunggu...`,
          { parse_mode: 'Markdown' }
        );
        const scrapingMsgId = scrapingMsg?.message_id || null;

        try {
          const scraped = await scrapeChannelVideos(channelUrl, async (found) => {
            if (scrapingMsgId) {
              await sendTelegramMessage(
                chatId,
                `🔍 *Mengambil semua video dari channel max.porn...*\n📺 Channel: \`${slug}\`\n✅ Ditemukan: *${found} video*`,
                scrapingMsgId
              );
            }
          });

          for (const v of scraped) {
            allLinks.push(v.url);
            if (v.title) allNames[v.url] = v.title;
          }

          await sendTelegramMessage(
            chatId,
            `✅ *Scrape selesai!*\n📺 Channel: \`${slug}\`\n🎬 Total ditemukan: *${scraped.length} video*`,
            scrapingMsgId
          );

          if (scraped.length === 0) {
            await ctx.reply(
              `⚠️ *Tidak ada video ditemukan di channel* \`${slug}\`\n\nMungkin URL-nya berbeda atau channel kosong.`,
              { parse_mode: 'Markdown' }
            );
          }
        } catch (scrapeErr) {
          logger.error('MaxPorn channel scrape error', { error: scrapeErr.message });
          await sendTelegramMessage(
            chatId,
            `❌ *Gagal scrape channel* \`${slug}\`\nError: ${scrapeErr.message}`,
            scrapingMsgId
          );
        }
      }

      // ── TikTok profile scrape ─────────────────────────────────────────────
      for (const profileUrl of tiktokProfiles) {
        const slug = getProfileSlug(profileUrl);
        const scrapingMsg = await ctx.reply(
          `🔍 *Mengambil semua video dari profil TikTok...*\n👤 Profil: \`@${slug}\`\n⏳ Mohon tunggu...`,
          { parse_mode: 'Markdown' }
        );
        const scrapingMsgId = scrapingMsg?.message_id || null;

        try {
          const scraped = await scrapeTikTokProfile(profileUrl, async (found) => {
            if (scrapingMsgId) {
              await sendTelegramMessage(
                chatId,
                `🔍 *Mengambil semua video dari profil TikTok...*\n👤 Profil: \`@${slug}\`\n✅ Ditemukan: *${found} video*`,
                scrapingMsgId
              );
            }
          });

          for (const v of scraped) {
            allLinks.push(v.url);
            if (v.title) allNames[v.url] = v.title;
          }

          await sendTelegramMessage(
            chatId,
            `✅ *Scrape selesai!*\n👤 Profil: \`@${slug}\`\n🎬 Total: *${scraped.length} video*`,
            scrapingMsgId
          );

          if (scraped.length === 0) {
            await ctx.reply(
              `⚠️ *Tidak ada video ditemukan di profil* \`@${slug}\`\n\nMungkin akun privat atau URL salah.`,
              { parse_mode: 'Markdown' }
            );
          }
        } catch (scrapeErr) {
          logger.error('TikTok profile scrape error', { error: scrapeErr.message });
          await sendTelegramMessage(
            chatId,
            `❌ *Gagal scrape profil TikTok* \`@${slug}\`\nError: ${scrapeErr.message}`,
            scrapingMsgId
          );
        }
      }

      if (beegProfileLinks.length > 0) {
        const profileUrl = beegProfileLinks[0];
        const slug = getSlugFromUrl(profileUrl);

        const scrapingMsg = await ctx.reply(
          `🔍 *Mengambil semua video dari profil beeg.com...*\n👤 Profil: \`${slug}\`\n⏳ Mohon tunggu...`,
          { parse_mode: 'Markdown' }
        );
        const scrapingMsgId = scrapingMsg?.message_id || null;

        try {
          const scraped = await scrapeAllVideos(profileUrl, async (found) => {
            if (scrapingMsgId) {
              await sendTelegramMessage(
                chatId,
                `🔍 *Mengambil semua video dari profil beeg.com...*\n👤 Profil: \`${slug}\`\n✅ Ditemukan: *${found} video*`,
                scrapingMsgId
              );
            }
          });

          for (const v of scraped) {
            allLinks.push(v.url);
            if (v.title) allNames[v.url] = v.title;
          }

          await sendTelegramMessage(
            chatId,
            `✅ *Scrape selesai!*\n👤 Profil: \`${slug}\`\n🎬 Total ditemukan: *${scraped.length} video*`,
            scrapingMsgId
          );
        } catch (scrapeErr) {
          logger.error('Beeg scrape error', { error: scrapeErr.message });
          await sendTelegramMessage(
            chatId,
            `❌ *Gagal scrape profil* \`${slug}\`\nError: ${scrapeErr.message}`,
            scrapingMsgId
          );
          if (!allLinks.length) return;
        }
      }

      if (allLinks.some(l => isBeegVideo(l) && !allNames[l])) {
        const beegSingles = allLinks.filter(l => isBeegVideo(l) && !allNames[l]);
        for (const url of beegSingles.slice(0, 10)) {
          const title = await fetchBeegVideoTitle(url).catch(() => null);
          if (title) allNames[url] = title;
        }
      }

      if (!allLinks.length) {
        await ctx.reply('❌ Tidak ada video yang ditemukan.', { parse_mode: 'Markdown' });
        return;
      }

      pendingLinks.set(chatId, { links: allLinks, names: allNames, waiting_custom: false, global_folder: false });
      const count = allLinks.length;
      const firstTitle = allNames[allLinks[0]];
      const preview = firstTitle
        ? `_${firstTitle.slice(0, 60)}${firstTitle.length > 60 ? '…' : ''}_`
        : `\`${allLinks[0].slice(0, 60)}${allLinks[0].length > 60 ? '…' : ''}\``;

      await ctx.reply(
        `🔗 *${count} link diterima*\n${preview}\n\n📁 *Simpan ke folder mana?*`,
        {
          parse_mode: 'Markdown',
          ...buildFolderChoiceKeyboard(chatId, storage.getDownloadDir(), storage.getFolderHistory(chatId))
        }
      );
    } catch (error) {
      logger.error('Text handler error', { error: error.message });
      await ctx.reply('❌ Terjadi error. Coba lagi.');
    }
  }));
}

async function withRetry429(fn, label = 'operation') {
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const match = err.message?.match(/retry after (\d+)/i);
      if (match) {
        const waitSec = parseInt(match[1], 10) + 2;
        logger.warn(`⚠️  Telegram rate limit (429) pada ${label}. Tunggu ${waitSec} detik...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
      } else {
        throw err;
      }
    }
  }
}

async function runBot() {
  const savedDir = stateManager.loadState();
  const LEGACY_DEFAULT = `${config.BASE_DIR}/MyFolder`;
  const effectiveSavedDir = (savedDir === LEGACY_DEFAULT) ? '' : savedDir;
  const raw = config.DOWNLOAD_DIR_ENV || effectiveSavedDir || '';
  storage.initialize(raw);
  storage.cleanupOldFiles();

  stateManager.startAutoSave(5 * 60 * 1000, () => storage.getDownloadDir());

  // Restore antrian download yang belum selesai sebelum server mati
  try {
    if (fs.existsSync(PENDING_QUEUE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PENDING_QUEUE_FILE, 'utf8'));
      if (Array.isArray(raw) && raw.length > 0) {
        logger.info(`♻️  Memulihkan ${raw.length} download pending dari sesi sebelumnya...`);
        for (const item of raw) {
          if (!item.url) continue;
          stateManager.removeProcessedLink(item.url);
          const names = item.name ? { [item.url]: item.name } : {};
          queueLinksToDownload([item.url], item.chatId, item.folder || storage.getDownloadDir(), { names });
        }
        logger.info(`✅ ${pendingDownloadItems.size} link berhasil dimasukkan kembali ke antrian`);
      }
    }
  } catch (e) {
    logger.error('Gagal memulihkan pending_downloads.json', { error: e.message });
  }

  // Restore antrian upload Byse yang belum selesai
  try {
    if (fs.existsSync(BEEG_UPLOAD_QUEUE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(BEEG_UPLOAD_QUEUE_FILE, 'utf8'));
      if (Array.isArray(raw) && raw.length > 0) {
        const existing = raw.filter(item => item.filepath && fs.existsSync(item.filepath));
        if (existing.length > 0) {
          logger.info(`♻️  Memulihkan ${existing.length} file pending upload ke Byse...`);
          for (const item of existing) {
            const ok = uploadQueue.put(item);
            if (ok) pendingUploadItems.set(item.filepath, item);
          }
          saveBeegUploadQueue();
          logger.info(`✅ ${pendingUploadItems.size} file berhasil dimasukkan kembali ke antrian upload`);
        }
      }
    }
  } catch (e) {
    logger.error('Gagal memulihkan beeg_upload_queue.json', { error: e.message });
  }

  for (let i = 0; i < config.MAX_WORKERS; i++) {
    workerLoop(i + 1);
  }

  for (let i = 0; i < config.BYSE_UPLOAD_CONCURRENCY; i++) {
    uploadWorkerLoop(i + 1);
  }

  const bot = new Telegraf(config.BOT_TOKEN, {
    telegram: { timeout: config.TIMEOUT * 1000 }
  });
  botInstance = bot;

  const safeEdit = (ctx) => async (text, extra = {}) => {
    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...extra });
    } catch (error) {
      if (!error.message?.includes('message is not modified')) throw error;
    }
  };

  const state = {
    downloadQueue,
    uploadQueue,
    uploadStats,
    stateManager,
    storage,
    activeDownloads,
    pendingLinks,
    removeMode,
    config,
    safeEdit: (ctx) => safeEdit(ctx),
    queueLinksToDownload
  };

  await withRetry429(
    () => bot.telegram.setMyCommands([
      { command: 'start', description: 'Mulai bot' },
      { command: 'menu', description: 'Tampilkan menu utama' },
    ]),
    'setMyCommands'
  );

  bot.start(requireAuth(async ctx => {
    const failedCount = stateManager.getFailedDownloads(null).length;
    await ctx.reply(
      '👋 Halo! Tekan *🏠 Menu Utama* kapan saja untuk membuka menu.',
      { parse_mode: 'Markdown', ...getPersistentMenuKeyboard() }
    );
    await ctx.reply(
      templates.home(storage.getDownloadDir(), downloadQueue.size, failedCount),
      { parse_mode: 'Markdown', ...getMainInlineKeyboard(failedCount) }
    );
  }));

  bot.command('menu', requireAuth(async ctx => {
    const failedCount = stateManager.getFailedDownloads(null).length;
    await ctx.reply(
      templates.home(storage.getDownloadDir(), downloadQueue.size, failedCount),
      { parse_mode: 'Markdown', ...getMainInlineKeyboard(failedCount) }
    );
  }));

  bot.catch((err, ctx) => {
    const ignorable = [
      'message is not modified',
      'message to edit not found',
      'query is too old',
      'MESSAGE_ID_INVALID',
      'Bad Request: message can\'t be edited',
    ];
    const msg = err.message || '';
    if (ignorable.some(s => msg.includes(s))) return;
    logger.error('Unhandled bot error', { updateType: ctx?.updateType, error: msg });
    if (ctx?.callbackQuery) {
      ctx.answerCbQuery('❌ Terjadi error, coba lagi.').catch(() => {});
    }
  });

  registerCallbackHandlers(bot, state);

  const { handleDocument } = registerRemoteUploadHandlers(bot, remoteUploadState);

  registerTextHandlers(bot, handleDocument);

  const shutdown = async () => {
    logger.info('⚠️ Shutting down...');
    stateManager.stopAutoSave();
    stateManager.saveState(storage.getDownloadDir());
    await bot.stop('SIGINT');
    logger.info('✅ Bot stopped cleanly');
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await withRetry429(() => bot.launch(), 'bot.launch');

  // Kirim notifikasi ke semua chatId yang punya antrian pending setelah bot siap
  const restoredDownloads = pendingDownloadItems.size;
  const restoredUploads   = pendingUploadItems.size;

  const chatIdsToNotify = new Set([
    ...[...pendingDownloadItems.values()].map(i => i.chatId),
    ...[...pendingUploadItems.values()].map(i => i.chatId)
  ].filter(Boolean));

  for (const cid of chatIdsToNotify) {
    const dlCount = [...pendingDownloadItems.values()].filter(i => i.chatId === cid).length;
    const ulCount = [...pendingUploadItems.values()].filter(i => i.chatId === cid).length;
    let msg = `♻️ *Bot baru saja restart!*\n\n`;
    if (dlCount > 0) msg += `⬇️ *${dlCount} download* dilanjutkan dari sesi sebelumnya\n`;
    if (ulCount > 0) msg += `☁️ *${ulCount} file* antrian upload ke Byse dilanjutkan\n`;
    sendTelegramMessage(cid, msg).catch(() => {});
  }

  const failedCount = stateManager.getFailedDownloads(null).length;

  const sep = '═'.repeat(48);
  process.stdout.write(`\n\x1b[32m${sep}\x1b[0m\n`);
  process.stdout.write(`\x1b[1m\x1b[32m  ✅ BOT AKTIF\x1b[0m\n`);
  process.stdout.write(`\x1b[32m${sep}\x1b[0m\n`);
  process.stdout.write(`  \x1b[36m📁\x1b[0m Folder      : \x1b[33m${storage.getDownloadDir()}\x1b[0m\n`);
  process.stdout.write(`  \x1b[36m👷\x1b[0m DL Workers  : \x1b[33m${config.MAX_WORKERS}\x1b[0m\n`);
  process.stdout.write(`  \x1b[36m☁️\x1b[0m  UL Workers  : \x1b[33m${config.BYSE_UPLOAD_CONCURRENCY}\x1b[0m\n`);
  process.stdout.write(`  \x1b[36m📦\x1b[0m Max queue   : \x1b[33m${config.MAX_QUEUE_SIZE}\x1b[0m\n`);
  process.stdout.write(`  \x1b[36m🔐\x1b[0m Auth        : \x1b[33m${config.ALLOWED_USER_IDS.size ? [...config.ALLOWED_USER_IDS].join(', ') : 'SEMUA'}\x1b[0m\n`);
  process.stdout.write(`  \x1b[36m🔑\x1b[0m Byse API    : \x1b[33m${process.env.BYSE_API_KEY ? 'Terkonfigurasi ✅' : 'Belum diset ⚠️'}\x1b[0m\n`);
  if (restoredDownloads > 0 || restoredUploads > 0) {
    process.stdout.write(`  \x1b[36m♻️\x1b[0m  Restored    : \x1b[33m${restoredDownloads} download + ${restoredUploads} upload\x1b[0m\n`);
  }
  if (failedCount > 0) {
    process.stdout.write(`  \x1b[31m🔴\x1b[0m Sisa gagal: \x1b[31m${failedCount} link\x1b[0m dari sesi sebelumnya\n`);
  }
  process.stdout.write(`\x1b[32m${sep}\x1b[0m\n\n`);
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception (bot tetap jalan)', { error: error.message });
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error('Unhandled promise rejection (bot tetap jalan)', { error: msg });
});

async function startWithRetry() {
  while (true) {
    try {
      await runBot();
      break;
    } catch (error) {
      const match = error.message?.match(/retry after (\d+)/i);
      if (match) {
        const waitSec = parseInt(match[1], 10) + 2;
        logger.warn(`⚠️  CRITICAL 429 saat startup. Bot akan retry dalam ${waitSec} detik...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
      } else {
        logger.error('CRITICAL ERROR saat startup', { error: error.message });
        process.exit(1);
      }
    }
  }
}

startWithRetry();
