'use strict';

const { URL } = require('url');
const fs = require('fs');
const config = require('../config');

const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

function getSpinner(i) {
  return SPINNER_FRAMES[i % SPINNER_FRAMES.length];
}

function normalizeDir(name) {
  if (!name) return '';
  if (name === config.BASE_DIR || name.startsWith(config.BASE_DIR + '/')) return name;
  return `${config.BASE_DIR}/${name}`;
}

function extractLinks(text) {
  const raw = text.match(/https?:\/\/[^\s<>'"]+/g) || [];
  return raw.map(url => url.replace(/[.,;:!?)>\]]+$/, '')).filter(url => {
    try { new URL(url); return true; } catch { return false; }
  });
}

function formatDuration(secs) {
  secs = Math.floor(secs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}j ${m}m ${s}d`;
  if (m) return `${m}m ${s}d`;
  return `${s}d`;
}

function formatUptime(secs) {
  secs = Math.floor(secs);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d) return `${d}h ${h}j ${m}m`;
  if (h) return `${h}j ${m}m ${s}d`;
  if (m) return `${m}m ${s}d`;
  return `${s}d`;
}

function getReferer(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    for (const [domain, referer] of Object.entries(config.CDN_REFERER_MAP)) {
      if (host === domain || host.endsWith('.' + domain)) return referer;
    }
    return `${u.protocol}//${u.hostname}/`;
  } catch {
    return 'https://www.google.com/';
  }
}

function getFileSizeMb(filepath) {
  try {
    return fs.statSync(filepath).size / (1024 * 1024);
  } catch {
    return 0;
  }
}

module.exports = {
  SPINNER_FRAMES,
  getSpinner,
  normalizeDir,
  extractLinks,
  formatDuration,
  formatUptime,
  getReferer,
  getFileSizeMb
};
