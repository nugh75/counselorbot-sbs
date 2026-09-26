import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { timelineGlyph } from './timeline-legend.ts';

test('a goal review milestone glyphs as a diamond', () => {
    assert.equal(timelineGlyph({ kind: 'event', id: 'goal-review-3' }), '◆');
});

test('a past event glyphs as a filled dot', () => {
    assert.equal(timelineGlyph({ kind: 'event', id: 'evt-1', tense: 'past' }), '●');
});

test('a check action glyphs as a clock', () => {
    assert.equal(timelineGlyph({ kind: 'action', id: 'a1', action_kind: 'check' }), '◷');
});

test('any other action glyphs as a plain box', () => {
    assert.equal(timelineGlyph({ kind: 'action', id: 'a2' }), '☐');
    assert.equal(timelineGlyph({ kind: 'action', id: 'a3', action_kind: 'activity' }), '☐');
});

test('a review date glyphs as a target', () => {
    assert.equal(timelineGlyph({ kind: 'event', id: 'evt-2', review_date: true }), '◎');
});
