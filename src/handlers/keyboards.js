const { Markup } = require('telegraf');
const config = require('../config');
const { normalizeDir } = require('../utils/helpers');

/**
 * Main menu keyboard
 */
function getMainInlineKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Statistik', 'stats'),
      Markup.button.callback('📋 Antrian', 'queue')],
    [Markup.button.callback('📁 Ganti Folder', 'change_folder'),
      Markup.button.callback('🗑️ Kelola Cache', 'cache_menu')],
    [Markup.button.callback('❓ Bantuan', 'help'),
      Markup.button.callback('🔄 Refresh', 'refresh_menu')],
  ]);
}

/**
 * Cache management menu keyboard
 */
function getCacheMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🗑️ Hapus Semua Cache', 'clear_all_cache')],
    [Markup.button.callback('✂️ Hapus Link Tertentu', 'remove_link')],
    [Markup.button.callback('🔙 Kembali', 'menu')],
  ]);
}

/**
 * Stats page keyboard
 */
function getStatsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', 'stats'),
      Markup.button.callback('🗑️ Reset Stats', 'clear_stats')],
    [Markup.button.callback('🔙 Menu Utama', 'menu')],
  ]);
}

/**
 * Queue page keyboard
 */
function getQueueKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', 'queue')],
    [Markup.button.callback('🔙 Menu Utama', 'menu')],
  ]);
}

/**
 * Back button keyboard
 */
function getBackKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Menu Utama', 'menu')],
  ]);
}

/**
 * Folder choice keyboard
 */
function buildFolderChoiceKeyboard(chatId, currentFolder, folderHistory) {
  const rows = [];
  const shown = new Set();
  const defNorm = normalizeDir(config.DOWNLOAD_DIR_DEFAULT);

  if (currentFolder) {
    const icon = currentFolder === defNorm ? '🏠' : '📂';
    rows.push([Markup.button.callback(`${icon} Lanjutkan  ·  ${currentFolder}`, `dlf_use|${currentFolder}`)]);
    shown.add(currentFolder);
  }

  for (const h of (folderHistory || [])) {
    if (!shown.has(h) && h !== defNorm) {
      rows.push([Markup.button.callback(`🕒 ${h}`, `dlf_use|${h}`)]);
      shown.add(h);
    }
  }

  if (!shown.has(defNorm)) {
    rows.push([Markup.button.callback(`🏠 Default  ·  ${defNorm}`, `dlf_use|${defNorm}`)]);
  }

  rows.push([Markup.button.callback('✏️ Folder baru…', 'dlf_new')]);
  return Markup.inlineKeyboard(rows);
}

/**
 * Global folder change keyboard
 */
function buildGlobalFolderKeyboard(currentFolder) {
  const rows = [];
  const shown = new Set();
  const defNorm = normalizeDir(config.DOWNLOAD_DIR_DEFAULT);

  if (currentFolder) {
    rows.push([Markup.button.callback(`✅ Tetap pakai  ·  ${currentFolder}`, `gf_use|${currentFolder}`)]);
    shown.add(currentFolder);
  }

  if (!shown.has(defNorm)) {
    rows.push([Markup.button.callback(`🏠 Default  ·  ${defNorm}`, `gf_use|${defNorm}`)]);
  }

  rows.push([Markup.button.callback('✏️ Ketik nama folder baru', 'gf_new')]);
  rows.push([Markup.button.callback('🔙 Kembali', 'menu')]);
  return Markup.inlineKeyboard(rows);
}

module.exports = {
  getMainInlineKeyboard,
  getCacheMenuKeyboard,
  getStatsKeyboard,
  getQueueKeyboard,
  getBackKeyboard,
  buildFolderChoiceKeyboard,
  buildGlobalFolderKeyboard
};
