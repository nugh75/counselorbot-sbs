import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// #962: the chat stack and the pre-chat guided path follow the flat look (second
// visual audit, PR E2): tokens, no pills, one factor colour, 44px targets.
const files = [
    'qsa/GuidedChatInterface', 'qsa/FreeChatInterface', 'qsa/ChatWorkspace', 'qsa/RecommendationsPanel',
    'qsa/IdeaConclusion', 'qsa/IdeaTabs', 'qsa/ScoreInputForm', 'qsa/PDFUploader', 'qsa/ChatSettingsCard',
    'qsa/SessionReport', 'home/IntroScreen',
];
const read = (name: string) => readFileSync(new URL(`../components/${name}.tsx`, import.meta.url), 'utf-8');

const forbidden: [string, RegExp][] = [
    ['raw palette class', /\b(?:text|bg|border|ring|divide|outline|accent)-(?:slate|indigo|teal|sky|amber|emerald|red|purple|cyan|green|white|black)\b/],
    ['uppercase', /\buppercase\b/],
    ['third font weight', /\bfont-(?:medium|bold)\b/],
    ['41px or 36px target', /\b(?:min-)?h-(?:9|11)\b/],
    ['outline override', /\boutline-none\b/],
    ['dark: at the call site', /\bdark:/],
    ['pill', /rounded-full[^'"`]*\bpx-/],
    ['boxed Card', /<Card\b(?![^>]*variant="flat")/],
    ['hand-made field', /<(?:select|textarea)\b|<input\b(?![^>]*type="(?:radio|checkbox|file)")/],
];

for (const name of files) {
    test(`${name} sits on the tokens with no boxed card, pill or hand-made field`, () => {
        const source = read(name);
        for (const [label, pattern] of forbidden) assert.doesNotMatch(source, pattern, `${name}.tsx: ${label}`);
    });
}

test('ScoreInputForm gives every factor group one colour and a label, no rainbow', () => {
    const source = read('qsa/ScoreInputForm');
    assert.doesNotMatch(source, /PREFIX_COLOR|purple|cyan|green/);
    assert.match(source, /<h3 className="text-lg font-semibold text-ink">\{label\}<\/h3>/);
});

test('IntroScreen lists the four activities as flat entries', () => {
    const source = read('home/IntroScreen');
    assert.match(source, /<EntrySection id="intro-start-title"/);
    assert.match(source, /<EntryLink\b/);
    assert.doesNotMatch(source, /<article\b/);
});
