'use strict';

const { Markup } = require('telegraf');
const config = require('../config');

function getMainInlineKeyboard(failedCount = 0) {
  const rows = [
    [Markup.button.callback('📊 Statistik', 'stats'),
     Markup.button.callback('📋 Antrian', 'queue')],
    [Markup.button.callback('📁 Ganti Folder', 'change_folder'),
     Markup.button.callback('🗑️ Kelola Cache', 'cache_menu')],
    [Markup.button.callback('☁️ Remote Upload Byse', 'remote_upload_menu')],
    [Markup.button.callback('⚙️ Pengaturan', 'settings_menu')],
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
  const defNorm = config.BASE_DIR;

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
  const defNorm = config.BASE_DIR;

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

function getBackKeyboardTo(action) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Kembali', action)],
  ]);
}

function getRemoteUploadMenuKeyboard(jobs) {
  const rows = [
    [Markup.button.callback('📎 Remote dari File .txt', 'remote_add_from_file')],
    [Markup.button.callback('📤 Upload Lokal ke Byse', 'local_upload_folder')],
    [Markup.button.callback('🔍 Browse & Cek Duplikat Byse', 'byse_explorer')],
  ];

  if (jobs && jobs.length > 0) {
    rows.push([
      Markup.button.callback('📋 Cek Status', 'remote_status_menu'),
      Markup.button.callback('🗑️ Hapus Job', 'remote_delete_menu'),
    ]);
  }

  rows.push([Markup.button.callback('🔙 Menu Utama', 'menu')]);
  return Markup.inlineKeyboard(rows);
}

const EXPLORER_FOLDERS_PER_PAGE = 8;

function getByseExplorerKeyboard(folders, page = 1) {
  const totalPages = Math.max(1, Math.ceil(folders.length / EXPLORER_FOLDERS_PER_PAGE));
  const start = (page - 1) * EXPLORER_FOLDERS_PER_PAGE;
  const pageFolders = folders.slice(start, start + EXPLORER_FOLDERS_PER_PAGE);

  const rows = [
    [Markup.button.callback('🗂️ Root (file tanpa folder)', 'bex_folder|0|1')],
  ];

  pageFolders.forEach(f => {
    const name = (f.name || 'Unnamed').slice(0, 28);
    const count = f.file_count !== undefined ? ` (${f.file_count})` : '';
    rows.push([Markup.button.callback(`📁 ${name}${count}`, `bex_folder|${f.fld_id}|1`)]);
  });

  if (totalPages > 1) {
    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('◀ Prev', `byse_explorer|${page - 1}`));
    nav.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
    if (page < totalPages) nav.push(Markup.button.callback('Next ▶', `byse_explorer|${page + 1}`));
    rows.push(nav);
  }

  rows.push([Markup.button.callback('🔍 Scan Duplikat', 'bex_dupes')]);
  rows.push([Markup.button.callback('🔙 Kembali', 'remote_upload_menu')]);
  return Markup.inlineKeyboard(rows);
}

function getByseFilesKeyboard(files, fld_id, page, totalPages) {
  const rows = [];

  if (totalPages > 1) {
    const nav = [];
    if (page > 1) nav.push(Markup.button.callback('◀ Prev', `bex_folder|${fld_id}|${page - 1}`));
    nav.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
    if (page < totalPages) nav.push(Markup.button.callback('Next ▶', `bex_folder|${fld_id}|${page + 1}`));
    rows.push(nav);
  }

  rows.push([Markup.button.callback('🔙 Kembali ke Folder', 'byse_explorer')]);
  return Markup.inlineKeyboard(rows);
}

function getRemoteUploadStatusKeyboard(jobs) {
  const rows = jobs.slice(0, 10).map(job => {
    const label = job.url.startsWith('local:')
      ? `📁 ${job.url.slice(6, 6 + 30)}`
      : (job.url.length > 35 ? job.url.slice(0, 35) + '…' : job.url);
    return [Markup.button.callback(`📋 ${label}`, `remote_check|${job.filecode}`)];
  });
  rows.push([Markup.button.callback('🔙 Kembali', 'remote_upload_menu')]);
  return Markup.inlineKeyboard(rows);
}

function getRemoteUploadDeleteKeyboard(jobs) {
  const rows = jobs.slice(0, 10).map(job => {
    const label = job.url.startsWith('local:')
      ? `📁 ${job.url.slice(6, 6 + 28)}`
      : (job.url.length > 30 ? job.url.slice(0, 30) + '…' : job.url);
    return [Markup.button.callback(`🗑️ ${label}`, `remote_del|${job.filecode}`)];
  });
  rows.push([Markup.button.callback('🔙 Kembali', 'remote_upload_menu')]);
  return Markup.inlineKeyboard(rows);
}

function getLocalUploadFolderKeyboard(folders) {
  const rows = folders.slice(0, 12).map(folder => [
    Markup.button.callback(`📂 ${folder}`, `lu_folder|${folder}`)
  ]);
  rows.push([Markup.button.callback('🔙 Kembali', 'remote_upload_menu')]);
  return Markup.inlineKeyboard(rows);
}

function getLocalUploadFilesKeyboard(files, folderName) {
  const rows = [];

  if (files.length > 1) {
    rows.push([Markup.button.callback(`📤 Upload Semua (${files.length} file)`, `lu_all|${folderName}`)]);
  }

  files.slice(0, 10).forEach((file, i) => {
    const shortName = file.name.length > 28 ? file.name.slice(0, 28) + '…' : file.name;
    rows.push([Markup.button.callback(`📹 ${shortName}`, `lu_file|${i}`)]);
  });

  if (files.length > 10) {
    rows.push([Markup.button.callback(`_...${files.length - 10} file lainnya, gunakan "Upload Semua"_`, 'local_upload_folder')]);
  }

  rows.push([Markup.button.callback('🔙 Pilih Folder Lain', 'local_upload_folder')]);
  rows.push([Markup.button.callback('🔙 Menu Utama', 'menu')]);
  return Markup.inlineKeyboard(rows);
}

const PROFILES = {
  vps: {
    label: '🖥️ VPS / Replit',
    desc: 'Speed 3M · 4 fragment',
    DOWNLOAD_SPEED_LIMIT: '3M',
    DOWNLOAD_CONCURRENT_FRAGMENTS: 4,
  },
  pc: {
    label: '💻 PC / WSL Lokal',
    desc: 'Speed 1M · 2 fragment',
    DOWNLOAD_SPEED_LIMIT: '1M',
    DOWNLOAD_CONCURRENT_FRAGMENTS: 2,
  },
  unlimited: {
    label: '🚀 Server Kencang',
    desc: 'Tanpa limit · 8 fragment',
    DOWNLOAD_SPEED_LIMIT: '',
    DOWNLOAD_CONCURRENT_FRAGMENTS: 8,
  },
};

function detectProfile(cfg) {
  for (const [key, p] of Object.entries(PROFILES)) {
    if (p.DOWNLOAD_SPEED_LIMIT === (cfg.DOWNLOAD_SPEED_LIMIT || '') &&
        p.DOWNLOAD_CONCURRENT_FRAGMENTS === cfg.DOWNLOAD_CONCURRENT_FRAGMENTS) {
      return key;
    }
  }
  return 'custom';
}

function getSettingsMenuKeyboard(cfg) {
  const active = detectProfile(cfg);
  const speedLabel = cfg.DOWNLOAD_SPEED_LIMIT
    ? `${cfg.DOWNLOAD_SPEED_LIMIT}/s`
    : 'Tanpa Limit';

  const rows = Object.entries(PROFILES).map(([key, p]) => {
    const isActive = active === key;
    return [Markup.button.callback(
      `${isActive ? '✅ ' : ''}${p.label}  ·  ${p.desc}`,
      `profile|${key}`
    )];
  });

  rows.push([Markup.button.callback(
    `${active === 'custom' ? '✅ ' : ''}✏️ Manual  ·  ${speedLabel} · ${cfg.DOWNLOAD_CONCURRENT_FRAGMENTS} frag`,
    'speed_menu'
  )]);
  rows.push([Markup.button.callback('🔙 Menu Utama', 'menu')]);
  return Markup.inlineKeyboard(rows);
}

function getSpeedLimitMenuKeyboard(currentLimit) {
  const presets = [
    { label: '1 MB/s', value: '1M' },
    { label: '3 MB/s', value: '3M' },
    { label: '5 MB/s', value: '5M' },
    { label: '10 MB/s', value: '10M' },
    { label: '🚀 Tanpa Limit', value: '' },
  ];

  const rows = presets.map(p => {
    const active = (p.value === (currentLimit || ''));
    const icon = active ? '✅ ' : '';
    return [Markup.button.callback(`${icon}${p.label}`, `set_speed|${p.value}`)];
  });

  rows.push([Markup.button.callback('🔙 Kembali', 'settings_menu')]);
  return Markup.inlineKeyboard(rows);
}

function getPersistentMenuKeyboard() {
  return Markup.keyboard([
    ['🏠 Menu Utama']
  ]).resize().persistent();
}

module.exports = {
  PROFILES,
  getMainInlineKeyboard,
  getSettingsMenuKeyboard,
  getSpeedLimitMenuKeyboard,
  getCacheMenuKeyboard,
  getStatsKeyboard,
  getQueueKeyboard,
  getBackKeyboard,
  getBackKeyboardTo,
  getFailedMenuKeyboard,
  buildFolderChoiceKeyboard,
  buildGlobalFolderKeyboard,
  getRemoteUploadMenuKeyboard,
  getRemoteUploadStatusKeyboard,
  getRemoteUploadDeleteKeyboard,
  getLocalUploadFolderKeyboard,
  getLocalUploadFilesKeyboard,
  getPersistentMenuKeyboard,
  getByseExplorerKeyboard,
  getByseFilesKeyboard,
};
