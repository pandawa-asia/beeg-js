'use strict';

const https = require('https');
const http  = require('http');
const { URL } = require('url');
const logger = require('../utils/logger');

function isMaxPornUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'max.porn' || u.hostname.endsWith('.max.porn');
  } catch {
    return false;
  }
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // Pattern: /videos/{id}/{slug}/
    const idx = parts.indexOf('videos');
    if (idx !== -1 && parts[idx + 1] && /^\d+$/.test(parts[idx + 1])) {
      return parts[idx + 1];
    }
    // Fallback: first numeric segment
    for (const p of parts) {
      if (/^\d+$/.test(p)) return p;
    }
  } catch {}
  return null;
}

function extractTitleFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    // Pattern: /videos/{id}/{slug}/
    const idx = parts.indexOf('videos');
    if (idx !== -1 && parts[idx + 2]) {
      return parts[idx + 2]
        .replace(/-/g, ' ')
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim();
    }
  } catch {}
  return null;
}

function httpRequest(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   opts.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://max.porn/',
        ...(opts.headers || {})
      }
    };

    const req = lib.request(options, res => {
      // Follow single redirect
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
        if (opts.followRedirect === false) {
          return resolve({ status: res.statusCode, location: res.headers.location, body: '' });
        }
        return httpRequest(res.headers.location, { ...opts, followRedirect: false })
          .then(resolve).catch(reject);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body, location: null }));
    });

    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function extractHashFromHtml(html, videoId) {
  // Strategy 1: look for hash in get_file URLs anywhere in the page
  const getFileRe = /get_file\/\d+\/([a-f0-9]{32})\//gi;
  const m1 = getFileRe.exec(html);
  if (m1) return m1[1];

  // Strategy 2: look for hash in video src or data attributes
  const srcRe = new RegExp(`/${videoId}[_/][^"']*?([a-f0-9]{32})`, 'i');
  const m2 = srcRe.exec(html);
  if (m2) return m2[1];

  // Strategy 3: look for 32-char hex strings near video-related keywords
  const patterns = [
    /(?:hash|token|key|file_hash|video_hash)['":\s]+['"]?([a-f0-9]{32})['"]?/i,
    /['"\/]([a-f0-9]{32})['"\/]/g,
  ];

  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return m[1];
  }

  return null;
}

function extractDirectUrlFromHtml(html) {
  // Look for direct MP4 or M3U8 URLs in HTML
  const patterns = [
    /["'](https?:\/\/cdn\.privatehost\.com\/[^"']+\.mp4[^"']*)['"]/i,
    /["'](https?:\/\/[^"']+cdn[^"']+\.mp4[^"']*)['"]/i,
    /["'](https?:\/\/[^"']+privatehost[^"']+[^"']*)['"]/i,
    /src=["'](https?:\/\/[^"']+\.mp4[^"']*)['"]/i,
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) return m[1];
  }
  return null;
}

async function resolveMaxPornUrl(pageUrl) {
  const videoId = extractVideoId(pageUrl);
  const titleFromUrl = extractTitleFromUrl(pageUrl);

  if (!videoId) {
    throw new Error('Tidak bisa ambil video ID dari URL');
  }

  logger.info(`[MaxPornScraper] Fetching page: ${pageUrl} (videoId=${videoId})`);

  const res = await httpRequest(pageUrl);
  if (res.status !== 200) {
    throw new Error(`Gagal fetch halaman: HTTP ${res.status}`);
  }

  const html = res.body;

  // Strategy 1: look for direct URL embedded in HTML
  const directUrl = extractDirectUrlFromHtml(html);
  if (directUrl) {
    logger.info(`[MaxPornScraper] Direct URL ditemukan di HTML: ${directUrl.slice(0, 80)}`);
    return { directUrl, title: titleFromUrl, videoId };
  }

  // Strategy 2: extract hash and build get_file URL
  const hash = extractHashFromHtml(html, videoId);
  if (hash) {
    const range = String(Math.floor(parseInt(videoId) / 1000) * 1000);
    const qualities = ['1080p', '720p', '480p', '360p'];

    for (const quality of qualities) {
      const getFileUrl = `https://max.porn/get_file/13/${hash}/${range}/${videoId}/${videoId}_${quality}.mp4/`;
      logger.info(`[MaxPornScraper] Mencoba get_file URL (${quality}): ${getFileUrl}`);

      try {
        const r = await httpRequest(getFileUrl, { method: 'HEAD', followRedirect: false });
        if (r.status >= 300 && r.status < 400 && r.location) {
          logger.info(`[MaxPornScraper] Resolved ke CDN: ${r.location.slice(0, 80)}`);
          return { directUrl: r.location, title: titleFromUrl, videoId };
        } else if (r.status === 200) {
          return { directUrl: getFileUrl, title: titleFromUrl, videoId };
        }
      } catch (e) {
        logger.warn(`[MaxPornScraper] ${quality} gagal: ${e.message}`);
      }
    }
  }

  throw new Error('Tidak bisa mendapatkan URL video dari halaman max.porn');
}

module.exports = { isMaxPornUrl, resolveMaxPornUrl, extractVideoId, extractTitleFromUrl };
