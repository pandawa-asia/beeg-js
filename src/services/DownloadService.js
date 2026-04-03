'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { getReferer, getSpinner, formatDuration, getFileSizeMb } = require('../utils/helpers');
const { DownloadError } = require('../errors/AppError');
const config = require('../config');

function tryUnlink(filepath) {
  try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
}

function splitLines(buffer, chunk) {
  const combined = buffer + chunk.toString();
  const lines = combined.split('\n');
  return { lines: lines.slice(0, -1), remainder: lines[lines.length - 1] };
}

class DownloadService {
  static downloadVideo(url, filename, folder, chatId, onProgress = null, retry = 0) {
    return new Promise((resolve) => {
      if (retry >= config.MAX_RETRIES) {
        logger.error('Download failed - max retries', { url, retry });
        return resolve({ ok: false, path: null, status: 'Maksimal retry tercapai' });
      }

      const delay = retry > 0 ? Math.min((2 ** retry) * 1000, 30000) : 0;

      setTimeout(async () => {
        const baseNoExt = path.basename(filename, path.extname(filename));
        const forcedFilename = baseNoExt + '.mp4';
        const filepath = DownloadService.resolveUniqueFilepath(folder, forcedFilename);
        const startTime = Date.now();
        let lastStep = -1;
        let lastTg = 0;
        let spinner = 0;
        let proc = null;

        const cleanup = () => {
          tryUnlink(filepath);
          tryUnlink(filepath + '.part');
          tryUnlink(path.join(folder, filename));
          tryUnlink(path.join(folder, filename) + '.part');
        };

        try {
          const args = [
            '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
            '--merge-output-format', 'mp4',
            '--no-playlist',
            '--no-warnings',
            '--no-check-certificates',
            '--socket-timeout', '120',
            '--concurrent-fragments', String(config.DOWNLOAD_CONCURRENT_FRAGMENTS),
            '--buffer-size', config.DOWNLOAD_BUFFER_SIZE,
            '--fragment-retries', '5',
            '--retry-sleep', '1',
            '--progress-template',
            '[download] %(progress._percent_str)s at %(progress._speed_str)s ETA %(progress._eta_hms)s (frag %(progress._fragment_index)d/%(progress._fragment_count)d)',
            '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '--add-header', `Referer:${getReferer(url)}`,
            '--newline',
            '-o', filepath,
            ...(config.DOWNLOAD_SPEED_LIMIT ? ['--limit-rate', config.DOWNLOAD_SPEED_LIMIT] : []),
            url
          ];

          logger.debug('Starting yt-dlp', { url, filepath, retry });

          proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

          const onLine = async (line) => {
            line = line.trim();
            if (!line.includes('[download]')) return;

            let pct = null;

            // Coba parse persentase langsung
            const mPct = line.match(/(\d+(?:\.\d+)?)%/);
            if (mPct) {
              pct = parseFloat(mPct[1]);
            }

            // Fallback: hitung dari fragment jika tidak ada %
            if (pct === null) {
              const mFrag = line.match(/frag\s+(\d+)\/(\d+)/);
              if (mFrag) {
                const cur = parseInt(mFrag[1], 10);
                const tot = parseInt(mFrag[2], 10);
                if (tot > 0) pct = (cur / tot) * 100;
              }
            }

            if (pct === null) return;

            const now = Date.now();

            // Gunakan time-based throttle saja (bukan step-based)
            // supaya HLS stream yang stuck di 0% tetap update via fragment count
            if ((now - lastTg) / 1000 >= config.PROGRESS_THROTTLE_SEC) {
              lastTg = now;
              if (pct > lastStep * 10) lastStep = Math.floor(pct / 10);

              const sm = line.match(/at\s+([\d.]+\s*[\w]+\/s)/);
              const speed = sm ? sm[1].trim() : '—';
              const em = line.match(/ETA\s+(\S+)/);
              const eta = (em && em[1] !== 'Unknown' && em[1] !== 'NA') ? em[1] : '??';

              if (onProgress) {
                await onProgress({ percentage: pct, speed, eta, spinner: getSpinner(spinner) });
              }
              spinner++;
            }
          };

          let stdoutBuf = '';
          proc.stdout.on('data', chunk => {
            const { lines, remainder } = splitLines(stdoutBuf, chunk);
            stdoutBuf = remainder;
            lines.forEach(l => onLine(l));
          });

          let stderrBuf = '';
          proc.stderr.on('data', chunk => {
            const { lines, remainder } = splitLines(stderrBuf, chunk);
            stderrBuf = remainder;
            lines.forEach(l => onLine(l));
          });

          proc.on('close', async (code) => {
            const elapsed = (Date.now() - startTime) / 1000;

            if (code === 0 && fs.existsSync(filepath) && fs.statSync(filepath).size > 1024) {
              const sizeMb = getFileSizeMb(filepath);
              logger.info('Download berhasil', { url, filename, sizeMb: sizeMb.toFixed(2) });
              resolve({
                ok: true,
                path: filepath,
                status: `✅ ${sizeMb.toFixed(2)} MB • ${formatDuration(elapsed)}`
              });
            } else {
              cleanup();
              logger.warn('Download failed, retrying...', { url, code, retry });
              const next = await DownloadService.downloadVideo(url, filename, folder, chatId, onProgress, retry + 1);
              resolve(next);
            }
          });

          proc.on('error', async (error) => {
            logger.error('Process spawn error', { error: error.message });
            cleanup();
            const next = await DownloadService.downloadVideo(url, filename, folder, chatId, onProgress, retry + 1);
            resolve(next);
          });

        } catch (error) {
          logger.error('Download error', { error: error.message, retry });
          cleanup();
          if (proc) { try { proc.kill('SIGKILL'); } catch {} }
          const next = await DownloadService.downloadVideo(url, filename, folder, chatId, onProgress, retry + 1);
          resolve(next);
        }
      }, delay);
    });
  }

  static extractFilenameFromUrl(url) {
    const GENERIC_NAMES = new Set([
      'master', 'index', 'playlist', 'stream', 'video', 'hls', 'manifest',
      '1080p', '720p', '480p', '360p', '240p', '4k', '2k', 'hd', 'sd', 'uhd'
    ]);
    const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv']);
    const HLS_EXTS = new Set(['.m3u8', '.m3u', '.ts']);

    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const fn = segments[segments.length - 1] || '';

      // Segment berupa angka murni (misal Beeg video ID: /725317439180382)
      if (fn && /^\d{6,}$/.test(fn)) {
        return fn + '.mp4';
      }

      if (fn && fn.includes('.')) {
        const ext = path.extname(fn).toLowerCase();
        const base = path.basename(fn, ext);

        if (HLS_EXTS.has(ext)) {
          if (GENERIC_NAMES.has(base.toLowerCase())) {
            for (let i = segments.length - 2; i >= 0; i--) {
              const seg = segments[i];
              if (!seg || seg.length <= 2) continue;
              const segExt = path.extname(seg).toLowerCase();
              const segBase = path.basename(seg, segExt);
              if (VIDEO_EXTS.has(segExt) && !GENERIC_NAMES.has(segBase.toLowerCase())) {
                return segBase + '.mp4';
              }
              if (!segExt && /^[a-zA-Z0-9_\-]+$/.test(seg) && !GENERIC_NAMES.has(seg.toLowerCase())) {
                return seg + '.mp4';
              }
            }
            return `video_${Date.now()}.mp4`;
          }
          return base + '.mp4';
        }

        if (VIDEO_EXTS.has(ext) && !GENERIC_NAMES.has(base.toLowerCase())) {
          return fn;
        }

        if (!GENERIC_NAMES.has(base.toLowerCase())) {
          return fn;
        }
      }
    } catch {}
    return `video_${Date.now()}.mp4`;
  }

  static resolveUniqueFilepath(folder, filename) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let candidate = path.join(folder, filename);
    let counter = 1;
    while (fs.existsSync(candidate)) {
      candidate = path.join(folder, `${base}_${counter}${ext}`);
      counter++;
    }
    return candidate;
  }
}

module.exports = DownloadService;
