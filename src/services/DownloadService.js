const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { getReferer, getSpinner, formatDuration, getFileSizeMb } = require('../utils/helpers');
const { DownloadError } = require('../errors/AppError');
const config = require('../config');

/**
 * Service untuk handle video downloads
 */
class DownloadService {
  /**
   * Download video menggunakan yt-dlp
   * @param {string} url - Video URL
   * @param {string} filename - Output filename
   * @param {string} folder - Output folder
   * @param {number|string} chatId - Telegram chat ID
   * @param {Function} onProgress - Progress callback
   * @param {number} retry - Retry count
   * @returns {Promise<Object>} - { ok, path, status }
   */
  static downloadVideo(url, filename, folder, chatId, onProgress = null, retry = 0) {
    return new Promise((resolve) => {
      if (retry >= config.MAX_RETRIES) {
        const error = new DownloadError('Maksimal retry tercapai', 'MAX_RETRIES_REACHED');
        logger.error('Download failed - max retries', { url, retry });
        return resolve({ ok: false, path: null, status: error.message });
      }

      const delay = retry > 0 ? (2 ** retry) * 1000 : 0;

      setTimeout(async () => {
        const filepath = path.join(folder, filename);
        const startTime = Date.now();
        let lastStep = -1;
        let lastTg = 0;
        let spinner = 0;

        try {
          const command = [
            'yt-dlp', '-4', '-f', 'best',
            '--no-warnings', '--no-check-certificates',
            '--progress-template',
            '[download] %(progress._percent_str)s at %(progress._speed_str)s ETA %(progress._eta_hms)s (frag %(progress._fragment_index)d/%(progress._fragment_count)d)',
            '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '--add-header', `Referer:${getReferer(url)}`,
            '--newline', '-o', filepath, url
          ];

          logger.debug('Starting yt-dlp process', { url, filepath, retry });

          const proc = spawn(command[0], command.slice(1), {
            stdio: ['ignore', 'pipe', 'pipe']
          });

          const onLine = async (line) => {
            line = line.toString().trim();
            if (!line.includes('[download]') || !line.includes('%')) return;

            const m = line.match(/(\d+(?:\.\d+)?)%/);
            if (!m) return;

            const pct = parseFloat(m[1]);
            const step = Math.floor(pct / 10);
            const now = Date.now();

            if (step > lastStep && (now - lastTg) / 1000 >= config.PROGRESS_THROTTLE_SEC) {
              lastStep = step;
              lastTg = now;

              const sm = line.match(/at\s+([\d.]+\s*\w+\/s)/);
              const speed = sm ? sm[1].trim() : '0 B/s';
              const em = line.match(/ETA\s+(\d+:\d+|\w+)/);
              const eta = em ? em[1] : '??';
              const bar = '█'.repeat(Math.floor(pct / 4)) + '░'.repeat(25 - Math.floor(pct / 4));

              if (onProgress) {
                await onProgress({
                  percentage: pct,
                  speed,
                  eta,
                  bar,
                  spinner: getSpinner(spinner)
                });
              }
              spinner++;
            }
          };

          let buffer = '';
          proc.stdout.on('data', chunk => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();
            lines.forEach(l => onLine(l));
          });

          proc.stderr.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            lines.forEach(l => onLine(l));
          });

          proc.on('close', async (code) => {
            const elapsed = (Date.now() - startTime) / 1000;

            if (code === 0 && fs.existsSync(filepath) && fs.statSync(filepath).size > 1024) {
              logger.info('Download berhasil', { url, filename, size: getFileSizeMb(filepath) });
              resolve({
                ok: true,
                path: filepath,
                status: `✅ ${getFileSizeMb(filepath).toFixed(2)} MB • ${formatDuration(elapsed)}`
              });
            } else {
              try {
                if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
              } catch {}

              logger.warn('Download failed, retrying...', { url, code, retry });
              const next = await DownloadService.downloadVideo(url, filename, folder, chatId, onProgress, retry + 1);
              resolve(next);
            }
          });

          proc.on('error', async (error) => {
            logger.error('Process error', { error: error.message });
            try {
              if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
            } catch {}
            const next = await DownloadService.downloadVideo(url, filename, folder, chatId, onProgress, retry + 1);
            resolve(next);
          });

        } catch (error) {
          logger.error('Download error', { error: error.message, retry });
          try {
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
          } catch {}
          const next = await DownloadService.downloadVideo(url, filename, folder, chatId, onProgress, retry + 1);
          resolve(next);
        }
      }, delay);
    });
  }

  /**
   * Extract filename dari URL
   * @param {string} url - URL
   * @returns {string}
   */
  static extractFilenameFromUrl(url) {
    try {
      const fn = path.basename(new URL(url).pathname);
      if (fn.endsWith('.mp4')) {
        return fn.toLowerCase().endsWith('.mp4') ? fn : fn + '.mp4';
      }
    } catch {}
    return `video_${Date.now()}.mp4`;
  }
}

module.exports = DownloadService;
