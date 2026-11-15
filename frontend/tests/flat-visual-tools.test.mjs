import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// #958: the visual tools and flashcards have no boxed panel, hand-made field, pill or modal.
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const FILES = [
    'components/visual/VisualTools.tsx', 'components/visual/PersonalTimeline.tsx',
    'components/visual/TimelineCalendar.tsx', 'components/visual/ExperienceReview.tsx',
    'components/flashcards/FlashcardsPage.tsx',
];

test('visual tools: flat, no hand fields, pills, shadows or pixel text sizes', () => {
    for (const file of FILES) {
        const source = read(file);
        assert.doesNotMatch(source, /<Card(?![^>]*variant="flat")[^>]*>/, `${file}: boxed Card`);
        assert.doesNotMatch(source, /(?<![:\w-])outline-none/, `${file}: outline-none`);
        assert.doesNotMatch(source, /rounded-full[^"'`]*px-\d/, `${file}: hand pill`);
        assert.doesNotMatch(source, /<(select|textarea)\b/, `${file}: hand field`);
        assert.doesNotMatch(source, /<input(?![^>]*type="(checkbox|radio)")/, `${file}: hand input`);
        assert.doesNotMatch(source, /shadow-card|bg-slate-|text-\[1[45]px\]|inputClass/, `${file}: shadow, slate or pixel text`);
        assert.doesNotMatch(source, /rounded-card border[^"'`]*p-4/, `${file}: boxed article`);
    }
});

test('image pickers and the new-deck form are Dialog, not hand-made modals', () => {
    for (const file of ['components/visual/VisualTools.tsx', 'components/flashcards/FlashcardsPage.tsx']) {
        const source = read(file);
        assert.match(source, /<Dialog\b/);
        assert.doesNotMatch(source, /createPortal\([\s\S]{0,80}fixed inset-0 z-\[95\]/, `${file}: hand modal`);
    }
});
