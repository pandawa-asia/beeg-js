'use strict';

const { Markup } = require('telegraf');
const config = require('../config');
const { normalizeDir } = require('../utils/helpers');

function getMainInlineKeyboard(failedCount = 0) {
  const rows = [
    [Markup.button.callback('📊 Statistik', 'stats'),
     Markup.button.callback('📋 Antrian', 'queue')],
    [Markup.button.callback('📁 Ganti Folder', 'change_folder'),
     Markup.button.callback('🗑️ Kelola Cache', 'cache_menu')],
    [Markup.button.callback('❓ Bantuan', 'help'),
     Markup.button.callback('🔄 Refresh', 'refresh_menu')],
  ];

  if (failedCount > 0) {
    rows.push([Markup.button.callback(`🔴 Download Gagal (${failedCount})`, 'failed_menu')]);
  }

  return Markup.inlineKeyboard(rows);
}

function getCacheMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🗑️ Hapus Semua Cache', 'clear_all_cache')],
    [Markup.button.callback('✂️ Hapus Link Tertentu', 'remove_link')],
    [Markup.button.callback('🔙 Kembali', 'menu')],
  ]);
}

function getStatsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', 'stats'),
     Markup.button.callback('🗑️ Reset Stats', 'clear_stats')],
    [Markup.button.callback('🔙 Menu Utama', 'menu')],
  ]);
}

function getQueueKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', 'queue')],
    [Markup.button.callback('🔙 Menu Utama', 'menu')],
  ]);
}

function getBackKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Menu Utama', 'menu')],
  ]);
}

function getFailedMenuKeyboard(items) {
  const rows = [];

  if (items.length > 0) {
    rows.push([
      Markup.button.callback('🔁 Retry Semua', 'retry_all_failed'),
      Markup.button.callback('🗑️ Hapus Semua', 'clear_all_failed'),
    ]);

    items.slice(0, 8).forEach((item, i) => {
      const short = (item.filename || item.url).slice(0, 28);
      rows.push([
        Markup.button.callback(`🔁 ${short}`, `retry_one_failed|${i}`),
        Markup.button.callback('✖', `del_one_failed|${i}`),
      ]);
    });
  }

  rows.push([Markup.button.callback('🔙 Menu Utama', 'menu')]);
  return Markup.inlineKeyboard(rows);
}

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
  getFailedMenuKeyboard,
  buildFolderChoiceKeyboard,
  buildGlobalFolderKeyboard
};
