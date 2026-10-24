const test = require('node:test');
const assert = require('node:assert/strict');
const QrCode = require('./qr.js');

test('QrCode encodes a trycloudflare URL', () => {
  const url = 'https://brave-lion-1234.trycloudflare.com';
  const qr = QrCode.encodeText(url);
  assert.ok(qr.version >= 1 && qr.version <= 40);
  assert.equal(qr.size, qr.version * 4 + 17);

  // Check finder patterns
  // Top-left finder (3, 3) must be true, (1, 1) must be false
  assert.equal(qr.getModule(3, 3), true);
  assert.equal(qr.getModule(1, 1), false);
  assert.equal(qr.getModule(0, 0), true);

  // Top-right finder
  assert.equal(qr.getModule(qr.size - 4, 3), true);

  // Bottom-left finder
  assert.equal(qr.getModule(3, qr.size - 4), true);
});

test('QrCode generates valid SVG markup', () => {
  const url = 'https://sample.trycloudflare.com';
  const svg = QrCode.generateSvg(url, 2, 220);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('width="220"'));
  assert.ok(svg.includes('height="220"'));
  assert.ok(svg.includes('<rect'));
  assert.ok(svg.includes('<path'));
  assert.ok(svg.endsWith('</svg>'));
});
