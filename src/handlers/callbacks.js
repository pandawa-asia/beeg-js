const logger = require('../utils/logger');
const templates = require('../messages/templates');
const { sanitizeFoldername } = require('../utils/validators');
const {
  getMainInlineKeyboard,
  getCacheMenuKeyboard,
  getStatsKeyboard,
  getQueueKeyboard,
  getBackKeyboard,
  buildGlobalFolderKeyboard,
  buildFolderChoiceKeyboard
} = require('./keyboards');

/**
 * Register callback query handlers
 * @param {Telegraf} bot - Bot instance
 * @param {Object} state - Bot state object
 */
function registerCallbackHandlers(bot, state) {
  const edit = (ctx) => state.safeEdit(ctx);

  bot.action('menu', async ctx => {
    await ctx.answerCbQuery('');
    await edit(ctx)(
      templates.home(state.storage.getDownloadDir(), state.downloadQueue.size),
      getMainInlineKeyboard()
    );
  });

  bot.action('refresh_menu', async ctx => {
    await ctx.answerCbQuery('Diperbarui!');
    await edit(ctx)(
      templates.home(state.storage.getDownloadDir(), state.downloadQueue.size),
      getMainInlineKeyboard()
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

    await ctx.reply(
      '✏️ *Folder Baru*\n\nKetik nama folder yang ingin digunakan:',
      { parse_mode: 'Markdown' }
    );
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

    await ctx.reply(
      '✏️ *Folder Baru*\n\nKetik nama folder yang ingin dijadikan folder aktif:',
      { parse_mode: 'Markdown' }
    );
  });

  logger.debug('Callback handlers registered');
}

module.exports = { registerCallbackHandlers };
