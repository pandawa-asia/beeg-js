'use strict';

const https = require('https');
const http  = require('http');
const { URL } = require('url');
const logger = require('../utils/logger');

// ─── URL Detectors ────────────────────────────────────────────────────────────

function isMaxPornUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'max.porn' || u.hostname.endsWith('.max.porn');
  } catch {
    return false;
  }
}

function isMaxPornChannelUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'max.porn' && !u.hostname.endsWith('.max.porn')) return false;
    const parts = u.pathname.split('/').filter(Boolean);
    // /channels/{slug}/ or /pornstars/{slug}/
    return (parts[0] === 'channels' || parts[0] === 'pornstars') && parts.length >= 2;
  } catch {
    return false;
  }
}

function isMaxPornVideoUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'max.porn' && !u.hostname.endsWith('.max.porn')) return false;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] === 'videos' && /^\d+$/.test(parts[1]);
  } catch {
    return false;
  }
}

function getChannelSlug(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[1] || null;
  } catch {
    return null;
  }
}

// ─── Title Extraction ─────────────────────────────────────────────────────────

function extractVideoId(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('videos');
    if (idx !== -1 && parts[idx + 1] && /^\d+$/.test(parts[idx + 1])) {
      return parts[idx + 1];
    }
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

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function httpRequest(urlStr, opts = {}, _redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const MAX_REDIRECTS = 8;
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
      const isRedirect = [301, 302, 303, 307, 308].includes(res.statusCode);
      if (isRedirect && res.headers.location) {
        if (opts.followRedirect === false) {
          return resolve({ status: res.statusCode, location: res.headers.location, body: '' });
        }
        if (_redirectCount >= MAX_REDIRECTS) {
          return reject(new Error(`Too many redirects (${MAX_REDIRECTS})`));
        }
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = `${parsed.protocol}//${parsed.hostname}${loc}`;
        return httpRequest(loc, opts, _redirectCount + 1)
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

// ─── Channel / Pornstar Scraper ───────────────────────────────────────────────

function extractVideoLinksFromHtml(html) {
  const seen   = new Set();
  const videos = [];

  // Match href="/videos/{id}/{slug}/"
  const re = /href=["']\/videos\/(\d+)\/([^"'\/]+)\//g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id   = m[1];
    const slug = m[2];
    const url  = `https://max.porn/videos/${id}/${slug}/`;
    if (!seen.has(id)) {
      seen.add(id);
      const title = slug.replace(/-/g, ' ').replace(/[^a-zA-Z0-9 ]/g, '').trim();
      videos.push({ url, title, id });
    }
  }

  return videos;
}

function buildPageUrl(baseUrl, page) {
  if (page === 1) return baseUrl;
  // max.porn pagination: /channels/asiam/2/ (angka di akhir path)
  const u = new URL(baseUrl);
  // Hapus trailing slash lalu tambahkan /page/
  const cleanPath = u.pathname.replace(/\/+$/, '');
  u.pathname = `${cleanPath}/${page}/`;
  return u.toString();
}

async function scrapeChannelVideos(channelUrl, onProgress) {
  const slug = getChannelSlug(channelUrl);
  logger.info(`[MaxPornScraper] Mulai scrape channel: ${slug}`);

  const allVideos = [];
  const seenIds   = new Set();
  let page = 1;
  const MAX_PAGES = 500;

  while (page <= MAX_PAGES) {
    const pageUrl = buildPageUrl(channelUrl, page);
    logger.debug(`[MaxPornScraper] Fetch page ${page}: ${pageUrl}`);

    let res;
    try {
      res = await httpRequest(pageUrl);
    } catch (e) {
      logger.warn(`[MaxPornScraper] Halaman ${page} error: ${e.message}`);
      break;
    }

    if (res.status !== 200) {
      logger.warn(`[MaxPornScraper] Halaman ${page} HTTP ${res.status}`);
      break;
    }

    const videos = extractVideoLinksFromHtml(res.body);

    // Cek apakah ada video baru (jika tidak ada, berarti habis)
    const newVideos = videos.filter(v => !seenIds.has(v.id));
    if (newVideos.length === 0) {
      logger.info(`[MaxPornScraper] Tidak ada video baru di halaman ${page}, berhenti`);
      break;
    }

    for (const v of newVideos) {
      seenIds.add(v.id);
      allVideos.push(v);
    }

    if (onProgress) onProgress(allVideos.length);

    // Cek apakah ada halaman berikutnya
    // max.porn pakai path: /channels/slug/2/, /channels/slug/3/, dst.
    const nextPage   = page + 1;
    const u          = new URL(channelUrl);
    const cleanPath  = u.pathname.replace(/\/+$/, '');
    const nextPath1  = `${cleanPath}/${nextPage}/`;   // /channels/asiam/2/
    const nextPath2  = `/${nextPage}/`;               // fallback cek angka saja

    const hasNext = (
      res.body.includes(nextPath1) ||
      res.body.includes(nextPath2) ||
      // fallback: kalau halaman penuh kemungkinan masih ada lanjutan
      newVideos.length >= 20
    );

    if (!hasNext) break;

    page++;
    await new Promise(r => setTimeout(r, 500)); // jeda sopan antar request
  }

  logger.info(`[MaxPornScraper] Selesai scrape channel ${slug}: ${allVideos.length} video dari ${page} halaman`);
  return allVideos;
}

// ─── Single Video Resolver ────────────────────────────────────────────────────

function extractHashFromHtml(html, videoId) {
  const getFileRe = /get_file\/\d+\/([a-f0-9]{32})\//gi;
  const m1 = getFileRe.exec(html);
  if (m1) return m1[1];

  const srcRe = new RegExp(`/${videoId}[_/][^"']*?([a-f0-9]{32})`, 'i');
  const m2 = srcRe.exec(html);
  if (m2) return m2[1];

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
  const videoId      = extractVideoId(pageUrl);
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

  const directUrl = extractDirectUrlFromHtml(html);
  if (directUrl) {
    logger.info(`[MaxPornScraper] Direct URL ditemukan di HTML: ${directUrl.slice(0, 80)}`);
    return { directUrl, title: titleFromUrl, videoId };
  }

  const hash = extractHashFromHtml(html, videoId);
  if (hash) {
    const range     = String(Math.floor(parseInt(videoId) / 1000) * 1000);
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

module.exports = {
  isMaxPornUrl,
  isMaxPornChannelUrl,
  isMaxPornVideoUrl,
  getChannelSlug,
  scrapeChannelVideos,
  resolveMaxPornUrl,
  extractVideoId,
  extractTitleFromUrl
};
