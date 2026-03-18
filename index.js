#!/usr/bin/env node
'use strict';

const { Telegraf } = require('telegraf');
const logger = require('./src/utils/logger');
const dashboard = require('./src/utils/dashboard');
const config = require('./src/config');
const { requireAuth } = require('./src/handlers/auth');
const { registerCallbackHandlers } = require('./src/handlers/callbacks');
const {
  getMainInlineKeyboard,
  buildFolderChoiceKeyboard,
  buildGlobalFolderKeyboard
} = require('./src/handlers/keyboards');
const AsyncQueue = require('./src/workers/AsyncQueue');
const StateManager = require('./src/services/StateManager');
const StorageManager = require('./src/services/StorageManager');
const DownloadService = require('./src/services/DownloadService');
const templates = require('./src/messages/templates');
const { extractLinks } = require('./src/utils/helpers');
const { sanitizeFoldername } = require('./src/utils/validators');

let botInstance = null;
const downloadQueue = new AsyncQueue(config.MAX_QUEUE_SIZE);
const stateManager = new StateManager();
const storage = new StorageManager();
const activeDownloads = new Map();
const removeMode = new Map();
const pendingLinks = new Map();

async function sendTelegramMessage(chatId, text, messageId = null, extra = {}) {
  if (!botInstance) return null;
  try {
    if (messageId) {
      return await botInstance.telegram.editMessageText(
        chatId, messageId, null, text,
        { parse_mode: 'Markdown', ...extra }
      );
    }
    return await botInstance.telegram.sendMessage(chatId, text, {
      parse_mode: 'Markdown', ...extra
    });
  } catch (error) {
    if (!error.message?.includes('message is not modified')) {
      logger.error('Gagal kirim pesan', { chatId, error: error.message });
    }
  }
  return null;
}

function queueLinksToDownload(links, chatId, folder) {
  let added = 0, dupes = 0, full = false;

  for (const link of links) {
    if (stateManager.isProcessed(link)) {
      dupes++;
      continue;
    }

    stateManager.addProcessedLink(link);
    const ok = downloadQueue.put({ url: link, name: null, chatId, folder });

    if (!ok) {
      full = true;
      stateManager.removeProcessedLink(link);
      break;
    }
    added++;
    stateManager.updateStats({ total: stateManager.downloadStats.total + 1 });
  }

  return { added, dupes, full };
}

async function workerLoop(workerId) {
  logger.info(`Worker-${workerId} started`);

  while (true) {
    try {
      const item = await downloadQueue.get();
      if (!item) continue;

      const { url, name, chatId, folder } = item;
      const filename = name || DownloadService.extractFilenameFromUrl(url);

      const acts = activeDownloads.get(chatId) || [];
      acts.push(filename);
      activeDownloads.set(chatId, acts);

      dashboard.startJob(workerId, filename);

      const msg = await sendTelegramMessage(
        chatId,
        templates.downloadStart(filename, folder, downloadQueue.size)
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

      const { ok, path: fp, status } = await DownloadService.downloadVideo(
        url, filename, folder, chatId, onProgress
      );

      const al = activeDownloads.get(chatId) || [];
      const fi = al.indexOf(filename);
      if (fi !== -1) al.splice(fi, 1);
      activeDownloads.set(chatId, al);

      if (ok) {
        stateManager.updateStats({ success: stateManager.downloadStats.success + 1 });
        dashboard.finishJob(workerId, { success: true, filename, info: status });
        await sendTelegramMessage(
          chatId,
          templates.downloadDone(filename, folder, status),
          messageId
        );
        logger.info('Download berhasil', { url, filename });
      } else {
        stateManager.updateStats({ failed: stateManager.downloadStats.failed + 1 });
        stateManager.removeProcessedLink(url);
        stateManager.addFailedDownload({ url, filename, folder, chatId, reason: status });
        dashboard.finishJob(workerId, { success: false, filename, info: status });
        await sendTelegramMessage(
          chatId,
          templates.downloadFailed(filename, status),
          messageId
        );
        logger.warn('Download gagal', { url, status });
      }

      stateManager.saveState(storage.getDownloadDir());
    } catch (error) {
      logger.error(`Worker-${workerId} error`, { error: error.message });
      dashboard.finishJob(workerId, { success: false, filename: '???', info: error.message });
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

function registerTextHandlers(bot) {
  bot.on('text', requireAuth(async ctx => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    try {
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
          const { added, dupes } = queueLinksToDownload(links, chatId, storage.getDownloadDir());
          stateManager.saveState(storage.getDownloadDir());
          await ctx.reply(
            `✅ *${added} link masuk antrian*\n💾 \`${storage.getDownloadDir()}\`` +
            (dupes ? `\n⚠️ ${dupes} duplikat dilewati` : '') +
            (added === 0 && !dupes ? '\n⚠️ Antrian penuh' : ''),
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

      pendingLinks.set(chatId, { links, waiting_custom: false, global_folder: false });
      const count = links.length;
      const preview = `\`${links[0].slice(0, 60)}${links[0].length > 60 ? '…' : ''}\``;

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

async function runBot() {
  logger.info('🚀 Bot starting...');

  const savedDir = stateManager.loadState();
  const raw = config.DOWNLOAD_DIR_ENV || savedDir || config.DOWNLOAD_DIR_DEFAULT;
  storage.initialize(raw);
  storage.cleanupOldFiles();

  stateManager.startAutoSave(5 * 60 * 1000, () => storage.getDownloadDir());

  logger.info('📁 Storage initialized', { directory: storage.getDownloadDir() });

  logger.info(`👷 Starting ${config.MAX_WORKERS} workers...`);
  for (let i = 0; i < config.MAX_WORKERS; i++) {
    workerLoop(i + 1);
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
    stateManager,
    storage,
    activeDownloads,
    pendingLinks,
    removeMode,
    config,
    safeEdit: (ctx) => safeEdit(ctx),
    queueLinksToDownload
  };

  bot.start(requireAuth(async ctx => {
    const failedCount = stateManager.getFailedDownloads(null).length;
    await ctx.reply(
      templates.home(storage.getDownloadDir(), downloadQueue.size, failedCount),
      { parse_mode: 'Markdown', ...getMainInlineKeyboard(failedCount) }
    );
  }));

  registerCallbackHandlers(bot, state);
  registerTextHandlers(bot);

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

  await bot.launch();

  const failedCount = stateManager.getFailedDownloads(null).length;

  logger.info('═'.repeat(50));
  logger.info('✅ BOT RUNNING SUCCESSFULLY!');
  logger.info('═'.repeat(50));
  logger.info(`📁 Folder: ${storage.getDownloadDir()}`);
  logger.info(`👷 Workers: ${config.MAX_WORKERS}`);
  logger.info(`📦 Max queue: ${config.MAX_QUEUE_SIZE}`);
  logger.info(`🔐 Auth users: ${config.ALLOWED_USER_IDS.size ? [...config.ALLOWED_USER_IDS].join(', ') : 'SEMUA'}`);
  if (failedCount > 0) {
    logger.warn(`🔴 Ada ${failedCount} download gagal dari sesi sebelumnya`);
  }
  logger.info('═'.repeat(50));
}

logger.info('🎬 Video Downloader Bot Starting...');
runBot().catch(error => {
  logger.error('❌ CRITICAL ERROR', { error: error.message, stack: error.stack });
  process.exit(1);
});
