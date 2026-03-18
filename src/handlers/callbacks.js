'use strict';

const logger = require('../utils/logger');
const templates = require('../messages/templates');
const {
  getMainInlineKeyboard,
  getCacheMenuKeyboard,
  getStatsKeyboard,
  getQueueKeyboard,
  getBackKeyboard,
  getFailedMenuKeyboard,
  buildGlobalFolderKeyboard,
  buildFolderChoiceKeyboard
} = require('./keyboards');

function registerCallbackHandlers(bot, state) {
  const edit = (ctx) => state.safeEdit(ctx);

  const getFailedCount = () => state.stateManager.getFailedDownloads(null).length;

  bot.action('menu', async ctx => {
    await ctx.answerCbQuery('');
    await edit(ctx)(
      templates.home(state.storage.getDownloadDir(), state.downloadQueue.size, getFailedCount()),
      getMainInlineKeyboard(getFailedCount())
    );
  });

  bot.action('refresh_menu', async ctx => {
    await ctx.answerCbQuery('Diperbarui!');
    await edit(ctx)(
      templates.home(state.storage.getDownloadDir(), state.downloadQueue.size, getFailedCount()),
      getMainInlineKeyboard(getFailedCount())
    );
  });

  bot.action('stats', async ctx => {
    await ctx.answerCbQuery('Diperbarui!');
    const stats = state.stateManager.getStats();
    await edit(ctx)(
      templates.stats(stats, state.storage.getDownloadDir(), state.config.MAX_WORKERS, state.downloadQueue.size),
      getStatsKeyboard()
    );
  });

  bot.action('clear_stats', async ctx => {
    state.stateManager.resetStats();
    state.stateManager.saveState(state.storage.getDownloadDir());
    const stats = state.stateManager.getStats();
    await ctx.answerCbQuery('Statistik direset!');
    await edit(ctx)(
      templates.stats(stats, state.storage.getDownloadDir(), state.config.MAX_WORKERS, state.downloadQueue.size),
      getStatsKeyboard()
    );
  });

  bot.action('queue', async ctx => {
    await ctx.answerCbQuery('Diperbarui!');
    const activeDownloads = Array.from(state.activeDownloads.values()).flat();
    await edit(ctx)(
      templates.queue(state.downloadQueue.size, state.config.MAX_WORKERS, state.config.MAX_QUEUE_SIZE, activeDownloads),
      getQueueKeyboard()
    );
  });

  bot.action('help', async ctx => {
    await ctx.answerCbQuery();
    await edit(ctx)(
      templates.help(state.storage.getDownloadDir(), state.config.MAX_QUEUE_SIZE, state.config.MAX_WORKERS, state.config.MAX_RETRIES, state.config.CLEANUP_DAYS),
      getBackKeyboard()
    );
  });

  bot.action('cache_menu', async ctx => {
    await ctx.answerCbQuery();
    await edit(ctx)(
      templates.cacheMenu(state.stateManager.processedLinks.size),
      getCacheMenuKeyboard()
    );
  });

  bot.action('clear_all_cache', async ctx => {
    const count = state.stateManager.clearProcessedLinks();
    state.stateManager.saveState(state.storage.getDownloadDir());
    await ctx.answerCbQuery(`✅ ${count} link dihapus!`);
    await edit(ctx)(
      `🗑️ *Cache Dibersihkan*\n\n✅ ${count} link dihapus dari cache.\n\nSemua link bisa didownload ulang sekarang!`,
      getBackKeyboard()
    );
  });

  bot.action('remove_link', async ctx => {
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery();
    state.removeMode.set(chatId, true);
    await ctx.reply(
      '✂️ *Hapus Link dari Cache*\n\nKirim link yang ingin dihapus dari cache.\nBisa lebih dari satu sekaligus.',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('change_folder', async ctx => {
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery();
    state.pendingLinks.set(chatId, { links: [], waiting_custom: false, global_folder: true });
    await edit(ctx)(
      `📁 *Ganti Folder Aktif*\n\nFolder saat ini: \`${state.storage.getDownloadDir()}\`\n\nPilih folder:`,
      buildGlobalFolderKeyboard(state.storage.getDownloadDir())
    );
  });

  bot.action('failed_menu', async ctx => {
    await ctx.answerCbQuery();
    const items = state.stateManager.getFailedDownloads(null);
    await edit(ctx)(
      templates.failedMenu(items),
      getFailedMenuKeyboard(items)
    );
  });

  bot.action('retry_all_failed', async ctx => {
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery('Memasukkan ke antrian...');

    const items = state.stateManager.getFailedDownloads(null);
    if (items.length === 0) {
      await edit(ctx)('✅ Tidak ada download gagal.', getBackKeyboard());
      return;
    }

    let retried = 0;
    for (const item of items) {
      state.stateManager.removeProcessedLink(item.url);
      const targetChatId = item.chatId || chatId;
      const folder = item.folder || state.storage.getDownloadDir();
      const ok = state.downloadQueue.put({ url: item.url, name: item.filename, chatId: targetChatId, folder });
      if (ok) {
        state.stateManager.addProcessedLink(item.url);
        retried++;
      }
    }

    state.stateManager.clearFailedDownloads();
    state.stateManager.saveState(state.storage.getDownloadDir());

    await edit(ctx)(
      `🔁 *Retry Semua*\n\n✅ ${retried} link dimasukkan ke antrian.\n_Notifikasi akan muncul saat selesai._`,
      getBackKeyboard()
    );

    logger.info(`Retry all failed: ${retried} links re-queued`);
  });

  bot.action(/^retry_one_failed\|(\d+)$/, async ctx => {
    const chatId = ctx.chat.id;
    const idx = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery('Memasukkan ke antrian...');

    const items = state.stateManager.getFailedDownloads(null);
    const item = items[idx];

    if (!item) {
      await edit(ctx)(
        templates.failedMenu(items),
        getFailedMenuKeyboard(items)
      );
      return;
    }

    state.stateManager.removeProcessedLink(item.url);
    const targetChatId = item.chatId || chatId;
    const folder = item.folder || state.storage.getDownloadDir();
    const ok = state.downloadQueue.put({ url: item.url, name: item.filename, chatId: targetChatId, folder });

    if (ok) {
      state.stateManager.addProcessedLink(item.url);
      state.stateManager.removeFailedDownload(item.url, item.chatId);
      state.stateManager.saveState(state.storage.getDownloadDir());
      await ctx.answerCbQuery('✅ Ditambah ke antrian!', { show_alert: false });
    } else {
      await ctx.answerCbQuery('⚠️ Antrian penuh, coba lagi nanti.', { show_alert: true });
    }

    const newItems = state.stateManager.getFailedDownloads(null);
    await edit(ctx)(
      templates.failedMenu(newItems),
      getFailedMenuKeyboard(newItems)
    );
  });

  bot.action(/^del_one_failed\|(\d+)$/, async ctx => {
    const idx = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery('Dihapus.');

    const items = state.stateManager.getFailedDownloads(null);
    const item = items[idx];
    if (item) {
      state.stateManager.removeFailedDownload(item.url, item.chatId);
      state.stateManager.saveState(state.storage.getDownloadDir());
    }

    const newItems = state.stateManager.getFailedDownloads(null);
    await edit(ctx)(
      templates.failedMenu(newItems),
      getFailedMenuKeyboard(newItems)
    );
  });

  bot.action('clear_all_failed', async ctx => {
    const count = state.stateManager.clearFailedDownloads();
    state.stateManager.saveState(state.storage.getDownloadDir());
    await ctx.answerCbQuery(`🗑️ ${count} entri dihapus`);
    await edit(ctx)(
      `✅ *Daftar Gagal Dibersihkan*\n\n${count} entri dihapus dari daftar.`,
      getBackKeyboard()
    );
  });

  bot.action(/^dlf_use\|(.+)$/, async ctx => {
    const chatId = ctx.chat.id;
    const folder = ctx.match[1];
    await ctx.answerCbQuery();

    const pend = state.pendingLinks.get(chatId) || {};
    const links = pend.links || [];

    state.storage.applyDownloadDir(folder, chatId);
    state.pendingLinks.delete(chatId);

    const { added, dupes } = state.queueLinksToDownload(links, chatId, state.storage.getDownloadDir());
    try {
      await ctx.editMessageText(
        `✅ *${added} link masuk antrian*\n💾 Folder: \`${state.storage.getDownloadDir()}\`${dupes ? `\n⚠️ ${dupes} duplikat dilewati` : ''}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      if (!e.message?.includes('message is not modified')) throw e;
    }
  });

  bot.action('dlf_new', async ctx => {
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery();

    const pend = state.pendingLinks.get(chatId) || {};
    state.pendingLinks.set(chatId, { ...pend, waiting_custom: true, global_folder: false });

    await ctx.reply('✏️ *Folder Baru*\n\nKetik nama folder yang ingin digunakan:', { parse_mode: 'Markdown' });
  });

  bot.action(/^gf_use\|(.+)$/, async ctx => {
    const chatId = ctx.chat.id;
    const folder = ctx.match[1];
    await ctx.answerCbQuery();

    state.storage.applyDownloadDir(folder, chatId);
    state.pendingLinks.delete(chatId);

    try {
      await ctx.editMessageText(
        `✅ *Folder Aktif Diubah*\n📁 \`${state.storage.getDownloadDir()}\``,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      if (!e.message?.includes('message is not modified')) throw e;
    }
  });

  bot.action('gf_new', async ctx => {
    const chatId = ctx.chat.id;
    await ctx.answerCbQuery();

    state.pendingLinks.set(chatId, { links: [], waiting_custom: true, global_folder: true });

    await ctx.reply('✏️ *Folder Baru*\n\nKetik nama folder yang ingin dijadikan folder aktif:', { parse_mode: 'Markdown' });
  });

  logger.debug('Callback handlers registered');
}

module.exports = { registerCallbackHandlers };
