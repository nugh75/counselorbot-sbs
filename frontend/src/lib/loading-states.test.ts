import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Loading states (#935): skeletons for pages, spinner only inside busy buttons, typing dots in chat.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('animate-spin lives only in Button', () => {
    const hits = execSync('grep -rl animate-spin . --include=*.tsx || true', { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
        .split('\n').filter(Boolean);
    assert.deepEqual(hits, ['./components/ui/Button.tsx']);
});

test('Button busy shows the spinner, disables and respects reduced motion', () => {
    const source = read('components/ui/Button.tsx');
    assert.match(source, /busy\?: boolean/);
    assert.match(source, /disabled=\{disabled \|\| busy\}/);
    assert.match(source, /motion-reduce:animate-none/);
});

test('Skeleton uses tokens and ships the entry-list and text shapes', () => {
    const source = read('components/ui/Skeleton.tsx');
    assert.match(source, /bg-surface-raised/);
    assert.match(source, /rounded-control/);
    assert.doesNotMatch(source, /bg-slate-200|rounded-md/);
    assert.match(source, /export function SkeletonEntryList/);
    assert.match(source, /export function SkeletonText/);
});

test('the chat waiting mark is the shared typing dots', () => {
    assert.match(read('components/ui/ChatBubble.tsx'), /<TypingDots \/>/);
    assert.match(read('components/ui/TypingDots.tsx'), /export function TypingDots/);
});
