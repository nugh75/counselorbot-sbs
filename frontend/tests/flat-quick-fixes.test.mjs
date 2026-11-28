import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('entry rows and ghost buttons show a visible hover', () => {
    assert.match(read('components/ui/EntryList.tsx'), /border-b border-transparent[^']*hover:border-line/);
    assert.doesNotMatch(read('components/ui/EntryList.tsx'), /hover:bg-surface-sunken/);
    assert.match(read('components/ui/Button.tsx'), /ghost: '[^']*hover:bg-surface-raised/);
});

test('goal tree nodes are rows, not boxes', () => {
    const tree = read('components/goals/GoalTree.tsx');
    assert.doesNotMatch(tree, /rounded-card border/);
    assert.match(tree, /border-b border-line/);
    assert.match(tree, /border-l border-line/);
    assert.doesNotMatch(read('components/goals/GoalMap.tsx'), /shadow-card/);
});

test('404 and error pages point back to the personal area', () => {
    assert.match(read('app/not-found.tsx'), /href="\/profilo"/);
    const error = read('app/error.tsx');
    assert.match(error, /^'use client'/);
    assert.match(error, /href="\/profilo"/);
});

test('class practice students and overview shortcuts are flat', () => {
    assert.doesNotMatch(read('components/teacher/ClassPracticeStudents.tsx'), /bg-role-test-soft|<Card/);
    const overview = read('components/teacher/ClassOverviewTab.tsx');
    assert.equal((overview.match(/<EntryLink\b[^>]*idPrefix="class-overview"/g) ?? []).length, 5);
    assert.doesNotMatch(overview, /group flex flex-col justify-between rounded-card/);
});
