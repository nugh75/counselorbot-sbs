const test = require('node:test');
const assert = require('node:assert/strict');
const QrCode = require('./qr.js');
const { validateDomainInput, validateTokenInput } = require('./panel.js');

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

test('QrCode encodes a stable custom domain URL for named tunnel (F1-10)', () => {
  const stableUrl = 'https://counselor.tuascuola.it';
  const qr = QrCode.encodeText(stableUrl);
  assert.ok(qr.version >= 1 && qr.version <= 40);
  assert.equal(qr.size, qr.version * 4 + 17);

  // Verify corner finders
  assert.equal(qr.getModule(0, 0), true);
  assert.equal(qr.getModule(qr.size - 1, 0), true);
  assert.equal(qr.getModule(0, qr.size - 1), true);

  const svg = QrCode.generateSvg(stableUrl, 2, 180);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('width="180"'));
  assert.ok(svg.includes('height="180"'));
  assert.ok(svg.includes('<path'));
  assert.ok(svg.endsWith('</svg>'));
});

test('validateDomainInput accepts valid domains and normalizes scheme', () => {
  assert.deepEqual(validateDomainInput('counselor.tuascuola.it'), {
    ok: true,
    domain: 'https://counselor.tuascuola.it',
  });
  assert.deepEqual(validateDomainInput('https://scuola.edu.it/'), {
    ok: true,
    domain: 'https://scuola.edu.it',
  });
  assert.deepEqual(validateDomainInput('http://labform.net'), {
    ok: true,
    domain: 'https://labform.net',
  });

  // Invalid inputs
  assert.equal(validateDomainInput('').ok, false);
  assert.equal(validateDomainInput('   ').ok, false);
  assert.equal(validateDomainInput('nodot').ok, false);
  assert.equal(validateDomainInput('counselor.tuascuola.it/path').ok, false);
  assert.equal(validateDomainInput('counselor.tuascuola.it:8080').ok, false);
  assert.equal(validateDomainInput('-invalid.it').ok, false);
});

test('validateTokenInput validates token syntax and length', () => {
  const validToken = 'eyJhIjoiMTIzNDUiLCJ0IjoiNjg3OSIsInMiOiJ4eXoifQ==';
  assert.deepEqual(validateTokenInput(validToken), {
    ok: true,
    token: validToken,
  });

  assert.equal(validateTokenInput('').ok, false);
  assert.equal(validateTokenInput('', true).ok, true); // optional
  assert.equal(validateTokenInput('too-short').ok, false);
  assert.equal(validateTokenInput('invalid characters with spaces in it!').ok, false);
});
