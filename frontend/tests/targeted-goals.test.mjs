// #905: read-only block of catalog goals targeted to a class, a student or a test student.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { goalText } from '../src/lib/i18n-goals.ts';

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the block reads the teacher-only targeted endpoint and is flat', () => {
    const source = read('components/goals/TargetedGoals.tsx');
    assert.match(source, /\/teacher\/goal-catalog\/targeted\?/);
    assert.match(source, /practice_notebook_id=/);
    assert.match(source, /&username=\$\{encodeURIComponent/);
    assert.doesNotMatch(source, /<Card|shadow/);
});

test('class overview, student view and test-student page mount the block', () => {
    assert.match(read('components/teacher/ClassOverviewTab.tsx'), /<TargetedGoals target=\{\{ groupId: group\.id \}\} \/>/);
    assert.match(read('components/teacher/ClassStudentsTab.tsx'), /withNotes goalGroupId=\{groupId\}/);
    assert.match(read('components/admin/PlanStudentsPanel.tsx'), /goalGroupId !== undefined && <TargetedGoals target=\{\{ groupId: goalGroupId, username: student\.username \}\} \/>/);
    assert.match(read('components/teacher/PracticeNotebooks.tsx'), /<TargetedGoals target=\{\{ practiceNotebookId: notebook\.id \}\} \/>/);
});

test('labels exist in all six languages', () => {
    for (const key of ['targetedClass', 'targetedStudent', 'targetedPractice', 'targetedHelp', 'targetedPracticeHelp', 'targetedEmpty', 'targetedUnavailable']) {
        const values = ['it', 'en', 'es', 'fr', 'de', 'sv'].map(lang => goalText(lang, key));
        assert.equal(new Set(values).size, 6, key);
    }
});
