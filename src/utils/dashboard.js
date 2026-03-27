'use strict';

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  gray:    '\x1b[90m',
  blue:    '\x1b[34m',
};

function bar(pct, width = 18) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round((p / 100) * width);
  const color = p >= 80 ? C.green : p >= 40 ? C.yellow : C.cyan;
  return color + '█'.repeat(filled) + C.dim + '░'.repeat(width - filled) + C.reset;
}

function truncate(str, max) {
  if (!str) return '';
  str = String(str);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function timestamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

class Dashboard {
  constructor(intervalMs = 3000) {
    this._jobs      = new Map();
    this._interval  = intervalMs;
    this._timer     = null;
    this._prevLines = 0;
  }

  startJob(workerId, filename) {
    this._jobs.set(workerId, { filename, pct: 0, speed: '—', eta: '??', start: Date.now() });
    this._ensureTimer();
  }

  updateJob(workerId, { pct, speed, eta }) {
    const j = this._jobs.get(workerId);
    if (!j) return;
    if (pct   !== undefined) j.pct   = pct;
    if (speed !== undefined) j.speed = speed;
    if (eta   !== undefined) j.eta   = eta;
  }

  finishJob(workerId, { success, filename, info = '' }) {
    this._jobs.delete(workerId);
    this._clearPrev();

    const ts    = `${C.gray}[${timestamp()}]${C.reset}`;
    const wTag  = `${C.bold}${C.magenta}W${workerId}${C.reset}`;
    const name  = `${C.yellow}${truncate(filename, 42)}${C.reset}`;
    const detail = info ? `  ${C.dim}${truncate(info, 50)}${C.reset}` : '';

    if (success) {
      process.stdout.write(`${ts} ${C.green}✔${C.reset}  ${wTag}  ${name}${detail}\n`);
    } else {
      process.stdout.write(`${ts} ${C.red}✖${C.reset}  ${wTag}  ${name}${detail}\n`);
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
      this._timer = setInterval(() => this._render(), this._interval);
      if (this._timer.unref) this._timer.unref();
    }
  }

  _stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._prevLines = 0;
  }

  _clearPrev() {
    for (let i = 0; i < this._prevLines; i++) {
      process.stdout.write('\x1b[1A\x1b[2K');
    }
    this._prevLines = 0;
  }

  _render() {
    if (this._jobs.size === 0) return;
    this._clearPrev();

    const SEP = `${C.cyan}${'─'.repeat(60)}${C.reset}`;
    const lines = [];

    lines.push(SEP);
    lines.push(
      `${C.cyan}  ⬇  ${C.bold}DOWNLOAD AKTIF${C.reset}${C.cyan}` +
      `  ${this._jobs.size} worker berjalan  ` +
      `${C.gray}[${timestamp()}]${C.reset}`
    );

    for (const [wid, j] of this._jobs.entries()) {
      const elapsed = Math.floor((Date.now() - j.start) / 1000);
      const name    = truncate(j.filename, 42);
      const pctNum  = Math.round(j.pct || 0);
      const pctStr  = String(pctNum).padStart(3) + '%';
      const speed   = (j.speed || '—').padEnd(12);
      const eta     = j.eta || '??';
      const elStr   = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m${elapsed % 60}s`;

      lines.push('');
      lines.push(
        `  ${C.bold}${C.magenta}W${wid}${C.reset}` +
        `  ${C.yellow}${name}${C.reset}` +
        `  ${C.gray}+${elStr}${C.reset}`
      );
      lines.push(
        `     ${bar(j.pct)}  ${C.bold}${pctStr}${C.reset}` +
        `  ${C.dim}${speed}  ETA ${eta}${C.reset}`
      );
    }

    lines.push(SEP);

    process.stdout.write(lines.join('\n') + '\n');
    this._prevLines = lines.length;
  }
}

module.exports = new Dashboard();
