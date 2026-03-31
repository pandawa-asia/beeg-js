'use strict';

const https = require('https');
const path = require('path');
const logger = require('../utils/logger');

const BEEG_STORE_API = 'https://store.externulls.com';
const FETCH_LIMIT = 100;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
        'Accept': 'application/json',
        'Referer': 'https://beeg.com/',
        'Origin': 'https://beeg.com'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
  });
}

function isBeegProfileUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'beeg.com' && !u.hostname.endsWith('.beeg.com')) return false;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return false;
    const slug = parts[0];
    return !/^\d+$/.test(slug);
  } catch {
    return false;
  }
}

function isBeegVideoUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'beeg.com' && !u.hostname.endsWith('.beeg.com')) return false;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.length === 1 && /^\d+$/.test(parts[0]);
  } catch {
    return false;
  }
}

function getSlugFromUrl(url) {
  const u = new URL(url);
  return u.pathname.split('/').filter(Boolean)[0];
}

function extractTitleFromFileData(fileObj) {
  if (!fileObj || !fileObj.data) return null;
  const nameEntry = fileObj.data.find(d => d.cd_column === 'sf_name' && d.cd_value);
  if (nameEntry) {
    return nameEntry.cd_value
      .replace(/[/\\:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
  }
  return null;
}

async function fetchBeegVideoTitle(videoUrl) {
  try {
    const u = new URL(videoUrl);
    const fileId = u.pathname.split('/').filter(Boolean)[0];
    if (!fileId || !/^\d+$/.test(fileId)) return null;

    const res = await httpGet(`${BEEG_STORE_API}/facts/file/${fileId}`);
    if (res.status !== 200) return null;

    const data = JSON.parse(res.body);
    const title = extractTitleFromFileData(data.file);
    return title || null;
  } catch {
    return null;
  }
}

async function fetchPageVideos(slug, offset) {
  const url = `${BEEG_STORE_API}/tag/videos/${slug.toLowerCase()}?limit=${FETCH_LIMIT}&offset=${offset}`;
  const res = await httpGet(url);

  if (res.status !== 200) {
    throw new Error(`API error: HTTP ${res.status}`);
  }

  const data = JSON.parse(res.body);
  const items = Array.isArray(data) ? data : Object.values(data);

  return items
    .filter(item => item && item.file && item.file.id)
    .map(item => ({
      url: `https://beeg.com/${item.file.id}`,
      title: extractTitleFromFileData(item.file)
    }));
}

async function scrapeAllVideos(profileUrl, onProgress) {
  const slug = getSlugFromUrl(profileUrl);
  logger.info(`[BeegScraper] Mulai scrape profil: ${slug}`);

  const allVideos = [];
  let offset = 0;
  let page = 1;

  while (true) {
    logger.debug(`[BeegScraper] Fetching page ${page} (offset=${offset})`);

    const videos = await fetchPageVideos(slug, offset);

    if (videos.length === 0) break;

    allVideos.push(...videos);

    if (onProgress) {
      onProgress(allVideos.length);
    }

    if (videos.length < FETCH_LIMIT) break;

    offset += FETCH_LIMIT;
    page++;

    await new Promise(r => setTimeout(r, 300));
  }

  logger.info(`[BeegScraper] Selesai: ${allVideos.length} video dari profil ${slug}`);
  return allVideos;
}

module.exports = {
  isBeegProfileUrl,
  isBeegVideoUrl,
  getSlugFromUrl,
  scrapeAllVideos,
  fetchBeegVideoTitle
};
