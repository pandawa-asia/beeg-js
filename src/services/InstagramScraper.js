'use strict';

const { spawn } = require('child_process');
const logger = require('../utils/logger');

// ─── URL Detectors ────────────────────────────────────────────────────────────

function isInstagramUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'instagram.com' || u.hostname.endsWith('.instagram.com');
  } catch { return false; }
}

// Single: /p/xxx  /reel/xxx  /tv/xxx
function isInstagramPostUrl(url) {
  if (!isInstagramUrl(url)) return false;
  try {
    const u = new URL(url);
    return /^\/(p|reel|tv)\//.test(u.pathname);
  } catch { return false; }
}

// Profile: instagram.com/username/  (bukan post, reel, stories, dll.)
function isInstagramProfileUrl(url) {
  if (!isInstagramUrl(url)) return false;
  try {
    const u = new URL(url);
    const skip = ['p', 'reel', 'tv', 'stories', 'explore', 'accounts', 'direct', 'ar'];
    const first = u.pathname.replace(/^\//, '').split('/')[0];
    return !!first && !skip.includes(first);
  } catch { return false; }
}

function getProfileSlug(url) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '').split('/')[0] || url;
  } catch { return url; }
}

// ─── Profile Scraper ─────────────────────────────────────────────────────────

/**
 * Ambil semua URL post/reel dari profil Instagram via yt-dlp --flat-playlist.
 * @param {string} profileUrl
 * @param {Function} onProgress - callback(count)
 * @returns {Promise<Array<{url, title, id}>>}
 */
function scrapeInstagramProfile(profileUrl, onProgress = null) {
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
      '--add-header', 'Referer:https://www.instagram.com/',
      profileUrl,
    ];

    logger.info('[InstagramScraper] Mulai scrape profil', { profileUrl });

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
      if (msg) logger.debug('[InstagramScraper] stderr', { msg });
    });

    proc.on('close', code => {
      if (code !== 0 && videos.length === 0) {
        return reject(new Error(`yt-dlp exit ${code} — tidak ada video ditemukan. Instagram sering butuh login untuk scrape profil.`));
      }
      logger.info('[InstagramScraper] Selesai scrape profil', { total: videos.length, profileUrl });
      resolve(videos);
    });

    proc.on('error', err => reject(err));
  });
}

module.exports = {
  isInstagramUrl,
  isInstagramPostUrl,
  isInstagramProfileUrl,
  getProfileSlug,
  scrapeInstagramProfile,
};
