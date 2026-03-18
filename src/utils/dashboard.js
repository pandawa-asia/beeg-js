'use strict';

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  white:   '\x1b[37m',
};

const WIDTH = 62;
const BAR_W = 16;

function bar(pct, width = BAR_W) {
  const pct2 = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((pct2 / 100) * width);
  return `${C.green}${'█'.repeat(filled)}${C.dim}${'░'.repeat(width - filled)}${C.reset}`;
}

function pad(str, len, right = false) {
  const s = String(str);
  if (s.length >= len) return s.slice(0, len);
  return right ? s.padStart(len) : s.padEnd(len);
}

function hr(char = '─', title = '') {
  if (!title) return C.cyan + char.repeat(WIDTH) + C.reset;
  const side = Math.floor((WIDTH - title.length - 2) / 2);
  const left = char.repeat(side);
  const right = char.repeat(WIDTH - side - title.length - 2);
  return `${C.cyan}${left}${C.reset} ${C.bold}${title}${C.reset} ${C.cyan}${right}${C.reset}`;
}

class Dashboard {
  constructor(intervalMs = 3000) {
    this._jobs = new Map();
    this._intervalMs = intervalMs;
    this._timer = null;
    this._lastLineCount = 0;
  }

  startJob(workerId, filename) {
    this._jobs.set(workerId, {
      filename,
      pct: 0,
      speed: '---',
      eta: '??',
      startTime: Date.now()
    });
    this._ensureTimer();
  }

  updateJob(workerId, { pct, speed, eta }) {
    const job = this._jobs.get(workerId);
    if (job) {
      if (pct  !== undefined) job.pct   = pct;
      if (speed !== undefined) job.speed = speed;
      if (eta  !== undefined) job.eta   = eta;
    }
  }

  finishJob(workerId, { success, filename, info = '' }) {
    this._jobs.delete(workerId);
    this._clearBlock();

    if (success) {
      process.stdout.write(
        `${C.green}${C.bold}✅ [W${String(workerId).padEnd(2)}]${C.reset} ${C.green}${filename}${C.reset}${info ? ` ${C.dim}${info}${C.reset}` : ''}\n`
      );
    } else {
      process.stdout.write(
        `${C.red}${C.bold}❌ [W${String(workerId).padEnd(2)}]${C.reset} ${C.yellow}${filename}${C.reset}${info ? ` ${C.dim}— ${info}${C.reset}` : ''}\n`
      );
    }

    if (this._jobs.size === 0) {
      this._stopTimer();
    } else {
      this._render();
    }
  }

  _ensureTimer() {
    if (!this._timer) {
      this._render();
      this._timer = setInterval(() => this._render(), this._intervalMs);
      if (this._timer.unref) this._timer.unref();
    }
  }

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._lastLineCount = 0;
  }

  _clearBlock() {
    if (this._lastLineCount > 0) {
      for (let i = 0; i < this._lastLineCount; i++) {
        process.stdout.write('\x1b[1A\x1b[2K');
      }
      this._lastLineCount = 0;
    }
  }

  _render() {
    if (this._jobs.size === 0) return;

    this._clearBlock();

    const lines = [];
    const now = Date.now();
    const count = this._jobs.size;

    lines.push(hr('─', `📥 DOWNLOAD AKTIF (${count})`));

    for (const [wid, job] of this._jobs.entries()) {
      const elapsed = Math.floor((now - job.startTime) / 1000);
      const name = pad(job.filename, 26);
      const pctStr = pad(Math.round(job.pct || 0), 3, true) + '%';
      const b = bar(job.pct);
      const speed = pad(job.speed || '---', 10);
      const eta = job.eta || '??';
      const wStr = pad(`W${wid}`, 4);

      lines.push(
        `${C.cyan}│${C.reset} ${C.bold}${C.magenta}${wStr}${C.reset} ` +
        `${C.yellow}${name}${C.reset} ` +
        `${b} ` +
        `${C.bold}${pctStr}${C.reset} ` +
        `${C.dim}${speed} ETA:${eta}${C.reset} ` +
        `${C.cyan}│${C.reset}`
      );
    }

    lines.push(hr('─'));
    const output = lines.join('\n') + '\n';
    process.stdout.write(output);
    this._lastLineCount = lines.length;
  }
}

module.exports = new Dashboard();
