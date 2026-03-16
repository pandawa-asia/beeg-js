#!/usr/bin/env node
'use strict';

const { Telegraf, Markup } = require('telegraf');
const logger = require('./src/utils/logger');
const config = require('./src/config');
const { requireAuth } = require('./src/handlers/auth');
const { registerCallbackHandlers } = require('./src/handlers/callbacks');
const { 
  getMainInlineKeyboard, 
  getCacheMenuKeyboard,
  getBackKeyboard,
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

/**
 * Send message to Telegram
 */
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

/**
 * Queue links untuk download
 */
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
      break;
    }
    added++;
    stateManager.updateStats({ total: stateManager.downloadStats.total + 1 });
  }
  
  return { added, dupes, full };
}

/**
 * Worker loop untuk process downloads
 */
async function workerLoop(workerId) {
  logger.info(`Worker-${workerId} started`);
  
  while (true) {
    try {
      const item = await downloadQueue.get();
      if (!item) continue;

      const { url, name, chatId, folder } = item;
      const filename = name || DownloadService.extractFilenameFromUrl(url);

      // Track active downloads
      const acts = activeDownloads.get(chatId) || [];
      acts.push(filename);
      activeDownloads.set(chatId, acts);

      // Send start message
      const msg = await sendTelegramMessage(
        chatId,
        templates.downloadStart(filename, folder, downloadQueue.size)
      );
      const messageId = msg?.message_id || null;

      // Progress callback
      const onProgress = async (progress) => {
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

      // Download
      const { ok, path: fp, status } = await DownloadService.downloadVideo(
        url, filename, folder, chatId, onProgress
      );

      // Remove from active
      const al = activeDownloads.get(chatId) || [];
      const fi = al.indexOf(filename);
      if (fi !== -1) al.splice(fi, 1);
      activeDownloads.set(chatId, al);

      // Notify result
      if (ok) {
        stateManager.updateStats({ success: stateManager.downloadStats.success + 1 });
        await sendTelegramMessage(
          chatId,
          templates.downloadStart(filename, folder, downloadQueue.size).replace('Memulai', 'Selesai✅'),
          messageId
        );
        logger.info('Download berhasil', { url, filename });
      } else {
        stateManager.updateStats({ failed: stateManager.downloadStats.failed + 1 });
        stateManager.removeProcessedLink(url);
        await sendTelegramMessage(
          chatId,
          `❌ *Download Gagal*\n📁 \`${filename}\`\n⚠️ ${status}`,
          messageId
        );
        logger.warn('Download gagal', { url, status });
      }

      stateManager.saveState(storage.getDownloadDir());
    } catch (error) {
      logger.error(`Worker-${workerId} error`, { error: error.message });
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

/**
 * Register text message handlers
 */
function registerTextHandlers(bot) {
  bot.on('text', requireAuth(async ctx => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    try {
      // Remove link mode
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
        if (removed.length) {
          lines.push(`✅ *${removed.length} link dihapus*`);
        }
        if (notFound.length) {
          lines.push(`⚠️ *${notFound.length} tidak ada di cache*`);
        }

        await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
        return;
      }

      // Custom folder input
      const pend = pendingLinks.get(chatId) || {};
      if (pend.waiting_custom) {
        const folderName = sanitizeFoldername(text);
        if (!folderName) {
          await ctx.reply('❌ *Nama folder tidak valid.*', { parse_mode: 'Markdown' });
          return;
        }

        if (pend.global_folder) {
          storage.applyDownloadDir(folderName, chatId);
          pendingLinks.delete(chatId);
          await ctx.reply(
            `✅ *Folder Aktif Diubah*\n📁 \`${storage.getDownloadDir()}\``,
            { parse_mode: 'Markdown' }
          );
        } else {
          const links = pend.links || [];
          pendingLinks.delete(chatId);
          storage.applyDownloadDir(folderName, chatId);
          const { added, dupes, full } = queueLinksToDownload(links, chatId, storage.getDownloadDir());
          await ctx.reply(
            `✅ *${added} link masuk antrian*\n💾 ${storage.getDownloadDir()}`,
            { parse_mode: 'Markdown' }
          );
        }
        return;
      }

      // Extract links
      const links = extractLinks(text);
      if (!links.length) {
        await ctx.reply('❌ Tidak ada link yang valid.', { parse_mode: 'Markdown' });
        return;
      }

      // Ask for folder
      pendingLinks.set(chatId, { links, waiting_custom: false, global_folder: false });
      const count = links.length;
      const preview = `\`${links[0].slice(0, 60)}${links[0].length > 60 ? '…' : ''}\``;

      await ctx.reply(
        `🔗 *${count} link diterima*\n${preview}\n\n📁 *Simpan ke folder mana?*`,
        { parse_mode: 'Markdown', ...buildFolderChoiceKeyboard(chatId, storage.getDownloadDir(), storage.getFolderHistory(chatId)) }
      );
    } catch (error) {
      logger.error('Text handler error', { error: error.message });
      await ctx.reply('❌ Terjadi error. Coba lagi.');
    }
  }));
}

/**
 * Main bot setup
 */
async function runBot() {
  logger.info('🚀 Bot starting...');

  // Load state
  const savedDir = stateManager.loadState();
  const raw = config.DOWNLOAD_DIR_ENV || savedDir || config.DOWNLOAD_DIR_DEFAULT;
  storage.initialize(raw);
  storage.cleanupOldFiles();

  logger.info('📁 Storage initialized', { directory: storage.getDownloadDir() });

  // Start workers
  logger.info(`👷 Starting ${config.MAX_WORKERS} workers...`);
  for (let i = 0; i < config.MAX_WORKERS; i++) {
    workerLoop(i + 1);
  }

  // Create bot
  const bot = new Telegraf(config.BOT_TOKEN, {
    telegram: { timeout: config.TIMEOUT * 1000 }
  });
  botInstance = bot;

  // Middleware
  const safeEdit = (ctx) => async (text, extra = {}) => {
    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...extra });
    } catch (error) {
      if (!error.message?.includes('message is not modified')) throw error;
    }
  };

  // State object for handlers
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

  // Commands
  bot.start(requireAuth(async ctx => {
    await ctx.reply(templates.home(storage.getDownloadDir(), downloadQueue.size), {
      parse_mode: 'Markdown',
      ...getMainInlineKeyboard()
    });
  }));

  // Register handlers
  registerCallbackHandlers(bot, state);
  registerTextHandlers(bot);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('⚠️ Shutting down...');
    stateManager.saveState(storage.getDownloadDir());
    await bot.stop('SIGINT');
    logger.info('✅ Bot stopped cleanly');
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await bot.launch();

  logger.info('═'.repeat(50));
  logger.info('✅ BOT RUNNING SUCCESSFULLY!');
  logger.info('═'.repeat(50));
  logger.info(`📁 Folder: ${storage.getDownloadDir()}`);
  logger.info(`👷 Workers: ${config.MAX_WORKERS}`);
  logger.info(`📦 Max queue: ${config.MAX_QUEUE_SIZE}`);
  logger.info(`🔐 Auth users: ${config.ALLOWED_USER_IDS.size ? [...config.ALLOWED_USER_IDS].join(', ') : 'SEMUA'}`);
  logger.info('═'.repeat(50));
}

logger.info('🎬 Video Downloader Bot Starting...');
runBot().catch(error => {
  logger.error('❌ CRITICAL ERROR', { error: error.message, stack: error.stack });
  process.exit(1);
});
