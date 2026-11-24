import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const darkStart = css.indexOf('\n.dark {');
const lightCss = css.slice(0, darkStart);
const darkCss = css.slice(darkStart);

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

test('dark mode defines --info-ink explicitly with WCAG AA contrast on --info-soft', () => {
    const darkInfoInk = hexOf(darkCss, 'info-ink');
    const darkInfoSoft = hexOf(darkCss, 'info-soft');
    assert.ok(contrast(darkInfoInk, darkInfoSoft) >= 4.5, `dark info-ink/info-soft ${contrast(darkInfoInk, darkInfoSoft).toFixed(2)}`);
    // Light mode: --info-ink: var(--ink) (slate-900 #0f172a) on --info-soft (indigo-50 #e9f2f2).
    assert.match(lightCss, /--info-ink:\s*var\(--ink\);/);
    assert.ok(contrast('#0f172a', '#e9f2f2') >= 4.5);
});

test('.prose uses semantic tokens instead of fixed light hex colours', () => {
    const proseStart = css.indexOf('/* Prose styles for markdown content */');
    const proseEnd = css.indexOf('/* ============================================================================\n   DARK MODE');
    const proseBlock = css.slice(proseStart, proseEnd);
    assert.doesNotMatch(proseBlock, /#[0-9a-fA-F]{3,8}\b/);
    assert.match(proseBlock, /\.prose h1,[\s\S]*?\.prose h4 \{[\s\S]*?color:\s*var\(--ink\);/);
    assert.match(proseBlock, /\.prose strong \{[\s\S]*?color:\s*var\(--ink\);/);
    assert.match(proseBlock, /\.prose code \{[\s\S]*?background-color:\s*var\(--surface-raised\);[\s\S]*?color:\s*var\(--ink\);/);
    assert.match(proseBlock, /\.prose blockquote \{[\s\S]*?color:\s*var\(--ink-muted\);/);
    assert.doesNotMatch(darkCss, /\.dark \.prose (?:h1|strong|code|blockquote)\b/);
});

test('--success meets WCAG AA contrast on #ffffff and #f8fafc in light mode and stays readable in dark mode', () => {
    assert.match(lightCss, /--success:\s*var\(--color-emerald-700\);/);
    assert.doesNotMatch(lightCss, /--success:\s*var\(--color-emerald-600\);/);
    // Tailwind emerald-700 in both v3 (#047857) and v4 oklch->sRGB (#007a55) exceeds 4.5:1 on white and slate-50.
    for (const emerald700 of ['#047857', '#007a55']) {
        for (const bg of ['#ffffff', '#f8fafc']) {
            assert.ok(contrast(emerald700, bg) >= 4.5, `light success ${emerald700} on ${bg}: ${contrast(emerald700, bg).toFixed(2)}`);
        }
    }
    const darkSuccess = hexOf(darkCss, 'success');
    for (const bg of ['#0f172a', '#1e293b', '#334155', hexOf(darkCss, 'success-soft')]) {
        assert.ok(contrast(darkSuccess, bg) >= 4.5, `dark success on ${bg}: ${contrast(darkSuccess, bg).toFixed(2)}`);
    }
});
