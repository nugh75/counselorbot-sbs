import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The guided path before the chat (#926) is flat like the tool page it starts from.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const guidedPath = [
    '../components/questionnaire/CounselorSelector.tsx',
    '../components/questionnaire/CounselorCover.tsx',
    '../components/qsa/InputMethodSelector.tsx',
    '../components/qsa/ChatSettingsCard.tsx',
    '../components/qsa/ProfileScoresPanel.tsx',
    '../components/qsa/GuidedChatInterface.tsx',
    '../components/qsa/ProfileVisualization.tsx',
    '../components/qsa/RecommendationsPanel.tsx',
];

test('glass-panel is retired from the guided path and from globals.css', () => {
    for (const file of guidedPath) assert.doesNotMatch(read(file), /glass-panel/, file);
    assert.doesNotMatch(read('../app/globals.css'), /glass-panel/);
});

test('the fallback cover is flat on the --i-* variables', () => {
    const cover = read('../components/questionnaire/CounselorCover.tsx');
    assert.doesNotMatch(cover, /linearGradient/);
    assert.doesNotMatch(cover, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(cover, /indigo|violet|toUpperCase\(\)\s*\}/);
    assert.match(cover, /stroke="var\(--i-out\)"/);
    assert.match(cover, /fill="var\(--i-cream\)"/);
});

test('counselors are rows with one metadata line, without pills or shadows', () => {
    const selector = read('../components/questionnaire/CounselorSelector.tsx');
    assert.doesNotMatch(selector, /rounded-full border/);
    assert.doesNotMatch(selector, /shadow-/);
    assert.match(selector, /meta\.join\(' · '\)/);
    assert.match(selector, /<Callout variant="warning">/);
    assert.doesNotMatch(selector, /grid gap-4 sm:grid-cols-2 lg:grid-cols-3/);
});

test('input choices are flat rows on tokens, with the shared primitives', () => {
    const input = read('../components/qsa/InputMethodSelector.tsx');
    assert.doesNotMatch(input, /\b(?:slate|indigo|red)-\d|min-h-11|bg-white|font-medium/);
    assert.match(input, /<Button type="submit"/);
    assert.match(input, /<Select/);
});

test('the page panels before the chat are flat cards', () => {
    const page = read('../app/page.tsx');
    assert.doesNotMatch(page, /<Card className="p-[68] /);
    assert.equal((page.match(/<Card variant="flat"/g) || []).length >= 5, true);
});
