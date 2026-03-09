/**
 * Unit tests untuk critical functions
 * Run dengan: npm test
 */

const {
  sanitizeFilename,
  sanitizeFoldername,
  isValidUrl
} = require('../src/utils/validators');

const {
  extractLinks,
  normalizeDir,
  formatDuration,
  getFileSizeMb
} = require('../src/utils/helpers');

describe('Validators', () => {
  test('sanitizeFilename removes invalid characters', () => {
    const result = sanitizeFilename('video*name?.mp4');
    expect(result).toBe('videonomame.mp4');
  });

  test('sanitizeFilename handles empty input', () => {
    expect(() => sanitizeFilename('')).toThrow();
  });

  test('sanitizeFoldername removes invalid characters', () => {
    const result = sanitizeFoldername('my/folder:name');
    expect(result).toBe('myfoldername');
  });

  test('isValidUrl validates URL format', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('not-a-url')).toBe(false);
  });
});

describe('Helpers', () => {
  test('extractLinks extracts URLs from text', () => {
    const text = 'Check this https://example.com and http://test.org';
    const links = extractLinks(text);
    expect(links).toHaveLength(2);
    expect(links[0]).toBe('https://example.com');
  });

  test('extractLinks returns empty array for text without URLs', () => {
    const links = extractLinks('Just some text');
    expect(links).toHaveLength(0);
  });

  test('normalizeDir adds base directory', () => {
    const result = normalizeDir('MyFolder');
    expect(result).toContain('Downloads');
    expect(result).toContain('MyFolder');
  });

  test('formatDuration formats seconds correctly', () => {
    expect(formatDuration(3661)).toBe('1j 1m 1d');
    expect(formatDuration(65)).toBe('1m 5d');
    expect(formatDuration(30)).toBe('30d');
  });
});

describe('AsyncQueue', () => {
  const AsyncQueue = require('../src/workers/AsyncQueue');

  test('queue put and get operations', async () => {
    const queue = new AsyncQueue(10);
    queue.put({ test: 'item' });
    const item = await queue.get();
    expect(item.test).toBe('item');
  });

  test('queue respects max size', () => {
    const queue = new AsyncQueue(2);
    queue.put({ item: 1 });
    queue.put({ item: 2 });
    const result = queue.put({ item: 3 });
    expect(result).toBe(false);
  });
});

describe('StateManager', () => {
  const StateManager = require('../src/services/StateManager');

  test('StateManager tracks processed links', () => {
    const manager = new StateManager();
    manager.addProcessedLink('https://example.com');
    expect(manager.isProcessed('https://example.com')).toBe(true);
  });

  test('StateManager clears processed links', () => {
    const manager = new StateManager();
    manager.addProcessedLink('https://example.com');
    const count = manager.clearProcessedLinks();
    expect(count).toBe(1);
    expect(manager.isProcessed('https://example.com')).toBe(false);
  });

  test('StateManager manages stats', () => {
    const manager = new StateManager();
    manager.updateStats({ success: 10, failed: 2 });
    const stats = manager.getStats();
    expect(stats.success).toBe(10);
    expect(stats.failed).toBe(2);
  });
});
