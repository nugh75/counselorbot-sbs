import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// #868: index-like teacher subpages are flat entry lists, not one box per item.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('classes list uses the shared entry list and no per-class tile', () => {
    const source = read('../components/admin/GroupsPanel.tsx');
    assert.match(source, /EntrySection/);
    assert.match(source, /EntryLink/);
    assert.doesNotMatch(source, /shadow-card transition-shadow/);
});

test('institutes and assignments rows use the flat Card', () => {
    assert.match(read('../components/teacher/InstitutesPanel.tsx'), /<Card key=\{row\.id\} variant="flat"/);
    assert.match(read('../components/teacher/AssignmentsPanel.tsx'), /<Card as="article" variant="flat"/);
});
