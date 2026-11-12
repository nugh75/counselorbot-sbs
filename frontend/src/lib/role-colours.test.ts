import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// I token --role-* in globals.css devono restare leggibili (WCAG AA, 4.5:1)
// per ink, corpo, muted e link, in chiaro e in scuro.
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const darkCss = css.slice(css.indexOf('\n.dark {'));
const lightCss = css.slice(0, css.indexOf('\n.dark {'));

const hexOf = (block: string, name: string) => {
    const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(m, `--${name} missing as hex`);
    return m[1];
};
const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

// slate-600 (muted chiaro) e i colori di testo di app: ink slate-900, corpo slate-700, link petrol-700.
const LIGHT_TEXT = { ink: '#0f172a', body: '#334155', muted: '#475569', link: '#124e52' };
const DARK_TEXT = { ink: '#f8fafc', body: '#cbd5e1', link: '#8fcfd1' };

test('role tints keep AA contrast for ink, body, muted and link in both themes', () => {
    for (const role of ['teacher', 'test'] as const) {
        const light = hexOf(lightCss, `role-${role}-soft`);
        for (const [k, fg] of Object.entries(LIGHT_TEXT)) {
            assert.ok(contrast(fg, light) >= 4.5, `light ${role} ${k} ${contrast(fg, light).toFixed(2)}`);
        }
        const dark = hexOf(darkCss, `role-${role}-soft`);
        const darkMuted = hexOf(darkCss, `role-${role}-muted`);
        for (const [k, fg] of Object.entries({ ...DARK_TEXT, muted: darkMuted })) {
            assert.ok(contrast(fg, dark) >= 4.5, `dark ${role} ${k} ${contrast(fg, dark).toFixed(2)}`);
        }
    }
});

test('student role reuses the petrol brand tokens', () => {
    assert.match(lightCss, /--role-student-soft:\s*var\(--brand-soft\)/);
    assert.match(lightCss, /--role-student-line:\s*var\(--brand-line\)/);
});
