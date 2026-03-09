const logger = require('../utils/logger');
const config = require('../config');

/**
 * Auth middleware untuk mengecek user authorization
 * @param {Function} handler - Request handler
 * @returns {Function}
 */
function requireAuth(handler) {
  return async (ctx, next) => {
    if (config.ALLOWED_USER_IDS.size) {
      const uid = ctx.from?.id;
      if (!config.ALLOWED_USER_IDS.has(uid)) {
        logger.warn('Unauthorized access attempt', { userId: uid });
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery('⛔ Akses ditolak.', { show_alert: true });
        } else {
          await ctx.reply('⛔ Akses ditolak.');
        }
        return;
      }
    }
    return handler(ctx, next);
  };
}

module.exports = { requireAuth };
