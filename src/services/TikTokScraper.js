'use strict';

const { spawn } = require('child_process');
const logger = require('../utils/logger');

// ─── URL Detectors ────────────────────────────────────────────────────────────

function isTikTokUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'tiktok.com'
      || u.hostname.endsWith('.tiktok.com')
      || u.hostname === 'vm.tiktok.com'
      || u.hostname === 'vt.tiktok.com';
  } catch { return false; }
}

// Single video: tiktok.com/@user/video/123 atau vm.tiktok.com/xxx
function isTikTokVideoUrl(url) {
  if (!isTikTokUrl(url)) return false;
  try {
    const u = new URL(url);
    // vm/vt = short link, selalu single video
    if (u.hostname === 'vm.tiktok.com' || u.hostname === 'vt.tiktok.com') return true;
    return u.pathname.includes('/video/');
  } catch { return false; }
}

// Profile: tiktok.com/@username (tanpa /video/)
function isTikTokProfileUrl(url) {
  if (!isTikTokUrl(url)) return false;
  try {
    const u = new URL(url);
    if (u.hostname === 'vm.tiktok.com' || u.hostname === 'vt.tiktok.com') return false;
    return /^\/@[^/]+\/?$/.test(u.pathname);
  } catch { return false; }
}

function getProfileSlug(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/@([^/]+)/);
    return m ? m[1] : url;
  } catch { return url; }
}

// ─── Profile Scraper ─────────────────────────────────────────────────────────

/**
 * Ambil semua URL video dari profil TikTok via yt-dlp --flat-playlist.
 * @param {string} profileUrl
 * @param {Function} onProgress - callback(count) saat tiap video ditemukan
 * @returns {Promise<Array<{url, title, id}>>}
 */
function scrapeTikTokProfile(profileUrl, onProgress = null) {
  return new Promise((resolve, reject) => {
    const videos = [];
    const seen   = new Set();
    let   buffer = '';

    const args = [
      '--flat-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--print', '%(webpage_url)s\t%(title)s\t%(id)s',
      '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '--add-header', 'Referer:https://www.tiktok.com/',
      profileUrl,
    ];

    logger.info('[TikTokScraper] Mulai scrape profil', { profileUrl });

    const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const parts = line.trim().split('\t');
        if (parts.length < 1 || !parts[0].startsWith('http')) continue;

        const url   = parts[0].trim();
        const title = (parts[1] || '').trim() || url;
        const id    = (parts[2] || '').trim() || url;

        if (seen.has(id)) continue;
        seen.add(id);
        videos.push({ url, title, id });

        if (onProgress) onProgress(videos.length);
      }
    });

    proc.stderr.on('data', chunk => {
      const msg = chunk.toString().trim();
      if (msg) logger.debug('[TikTokScraper] stderr', { msg });
    });

    proc.on('close', code => {
      if (code !== 0 && videos.length === 0) {
        return reject(new Error(`yt-dlp exit ${code} — tidak ada video ditemukan`));
      }
      logger.info('[TikTokScraper] Selesai scrape profil', { total: videos.length, profileUrl });
      resolve(videos);
    });

    proc.on('error', err => reject(err));
  });
}

module.exports = {
  isTikTokUrl,
  isTikTokVideoUrl,
  isTikTokProfileUrl,
  getProfileSlug,
  scrapeTikTokProfile,
};
