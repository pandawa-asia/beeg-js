const logger = require('../utils/logger');
const templates = require('../messages/templates');
const {
  getMainInlineKeyboard,
  getCacheMenuKeyboard,
  getStatsKeyboard,
  getQueueKeyboard,
  getBackKeyboard,
  buildGlobalFolderKeyboard
} = require('./keyboards');

/**
 * Register callback query handlers
 * @param {Telegraf} bot - Bot instance
 * @param {Object} state - Bot state object
 */
function registerCallbackHandlers(bot, state) {
  const { safeEdit } = state;

  bot.action('menu', async ctx => {
    await ctx.answerCbQuery('');
    await safeEdit(
      templates.home(state.storage.getDownloadDir(), state.downloadQueue.size),
      getMainInlineKeyboard()
    );
  });

  bot.action('refresh_menu', async ctx => {
    await ctx.answerCbQuery('Diperbarui!');
    await safeEdit(
      templates.home(state.storage.getDownloadDir(), state.downloadQueue.size),
      getMainInlineKeyboard()
    );
  });

  bot.action('stats', async ctx => {
    await ctx.answerCbQuery('Diperbarui!');
    const stats = state.stateManager.getStats();
    await safeEdit(
      templates.stats(stats, state.storage.getDownloadDir(), state.config.MAX_WORKERS, state.downloadQueue.size),
      getStatsKeyboard()
    );
  });

  bot.action('clear_stats', async ctx => {
    state.stateManager.resetStats();
    state.stateManager.saveState(state.storage.getDownloadDir());
    const stats = state.stateManager.getStats();
    await ctx.answerCbQuery('Statistik direset!');
    await safeEdit(
      templates.stats(stats, state.storage.getDownloadDir(), state.config.MAX_WORKERS, state.downloadQueue.size),
      getStatsKeyboard()
    );
  });

  bot.action('queue', async ctx => {
    await ctx.answerCbQuery('Diperbarui!');
    const activeDownloads = Array.from(state.activeDownloads.values()).flat();
    await safeEdit(
      templates.queue(state.downloadQueue.size, state.config.MAX_WORKERS, state.config.MAX_QUEUE_SIZE, activeDownloads),
      getQueueKeyboard()
    );
  });

  bot.action('help', async ctx => {
    await ctx.answerCbQuery();
    await safeEdit(
      templates.help(state.storage.getDownloadDir(), state.config.MAX_QUEUE_SIZE, state.config.MAX_WORKERS, state.config.MAX_RETRIES, state.config.CLEANUP_DAYS),
      getBackKeyboard()
    );
  });

  bot.action('cache_menu', async ctx => {
    await ctx.answerCbQuery();
    await safeEdit(
      templates.cacheMenu(state.stateManager.processedLinks.size),
      getCacheMenuKeyboard()
    );
  });

  bot.action('clear_all_cache', async ctx => {
    const count = state.stateManager.clearProcessedLinks();
    state.stateManager.saveState(state.storage.getDownloadDir());
    await ctx.answerCbQuery(`✅ ${count} link dihapus!`);
    await safeEdit(
      `🗑️ *Cache Dibersihkan*\n\n✅ ${count} link dihapus dari cache.\n\nSemua link bisa didownload ulang sekarang!`,
      getBackKeyboard()
    );
  });

  logger.debug('Callback handlers registered');
}

module.exports = { registerCallbackHandlers };
