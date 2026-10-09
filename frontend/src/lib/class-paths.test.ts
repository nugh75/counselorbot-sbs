import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { filterProgressStudents, lockedStepUnlockNumber, parseClassPath, parseClassPathProgress, progressCellCode, parseClassPathStep, parseClassPaths, parseStudentClassPath, parseStudentClassPathStep, parseStudentClassPaths } from './class-paths.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { classPathText, classPathsTexts } from './i18n-class-paths.ts';

test('class-paths parser handles step auto-detect and self-marking', () => {
    const autoStep = parseClassPathStep({
        id: 1,
        path_id: 10,
        position: 1,
        tool_key: 'bussola',
        title: 'Start here',
        auto_detect: true,
    });
    assert.equal(autoStep.id, 1);
    assert.equal(autoStep.tool_key, 'bussola');
    assert.equal(autoStep.auto_detect, true);
    assert.equal(autoStep.can_self_mark, false);

    const selfStep = parseClassPathStep({
        position: 2,
        tool_key: 'timeline',
        auto_detect: false,
    });
    assert.equal(selfStep.auto_detect, false);
    assert.equal(selfStep.can_self_mark, true);
});

test('class-paths parser handles full path with default recommended mode', () => {
    const path = parseClassPath({
        id: 42,
        group_id: 5,
        title: 'Start of year',
        revision: 1,
        created_by: 'docente',
        steps: [
            { id: 101, tool_key: 'QSA', position: 1, auto_detect: true },
        ],
    });
    assert.equal(path.id, 42);
    assert.equal(path.group_id, 5);
    assert.equal(path.title, 'Start of year');
    assert.equal(path.mode, 'recommended');
    assert.equal(path.status, 'draft');
    assert.equal(path.steps.length, 1);
    assert.equal(path.steps_count, 1);
});

test('class-paths parser handles array of paths', () => {
    const paths = parseClassPaths([
        { id: 1, group_id: 5, title: 'Path 1', mode: 'strict', status: 'published' },
        { id: 2, group_id: 5, title: 'Path 2', status: 'archived' },
    ]);
    assert.equal(paths.length, 2);
    assert.equal(paths[0].mode, 'strict');
    assert.equal(paths[0].status, 'published');
    assert.equal(paths[1].status, 'archived');
});

test('student class-paths parser handles step states, availability and self-marking', () => {
    const step = parseStudentClassPathStep({
        id: 11,
        path_id: 2,
        position: 1,
        tool_key: 'taccuino',
        title: 'Step 1',
        instructions: 'Scrivi qualcosa',
        due_date: '2026-10-31',
        state: 'not_done',
        source: null,
        start_href: '/taccuino',
        can_self_mark: true,
    });
    assert.equal(step.id, 11);
    assert.equal(step.state, 'not_done');
    assert.equal(step.start_href, '/taccuino');
    assert.equal(step.can_self_mark, true);

    const unavailStep = parseStudentClassPathStep({
        id: 12,
        path_id: 2,
        position: 2,
        tool_key: 'bussola',
        title: null,
        instructions: null,
        due_date: null,
        state: 'unavailable',
        source: null,
        start_href: null,
        can_self_mark: false,
    });
    assert.equal(unavailStep.state, 'unavailable');
    assert.equal(unavailStep.can_self_mark, false);
});

test('student class-paths parser handles full path payload and array', () => {
    const raw = {
        id: 2,
        group_id: 7,
        group_name: '3B',
        title: 'Percorso Autunno',
        description: 'Un percorso per riflettere',
        mode: 'strict',
        steps: [
            { id: 11, path_id: 2, position: 1, tool_key: 'taccuino', title: null, instructions: null, due_date: null, state: 'done', source: 'student', start_href: '/taccuino', can_self_mark: true },
            { id: 12, path_id: 2, position: 2, tool_key: 'pqbl', title: null, instructions: null, due_date: null, state: 'not_done', source: null, start_href: '/pqbl', can_self_mark: false },
        ],
        next_step_id: 12,
        done: 1,
        total: 2,
    };
    const path = parseStudentClassPath(raw);
    assert.equal(path.id, 2);
    assert.equal(path.group_name, '3B');
    assert.equal(path.mode, 'strict');
    assert.equal(path.next_step_id, 12);
    assert.equal(path.done, 1);
    assert.equal(path.total, 2);
    assert.equal(path.steps.length, 2);

    const list = parseStudentClassPaths([raw]);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 2);
});

test('class paths translations cover six languages and fallback to English', () => {
    for (const [key, translations] of Object.entries(classPathsTexts)) {
        assert.equal(translations.length, 6, key);
        assert.ok(translations.every(t => t.trim().length > 0), key);
    }

    assert.equal(classPathText('en', 'pathsTitle'), 'Class paths');
    assert.equal(classPathText('it', 'pathsTitle'), 'Percorsi di classe');
    assert.equal(classPathText('es', 'pathsTitle'), 'Itinerarios de clase');
    assert.equal(classPathText('fr', 'pathsTitle'), 'Parcours de classe');
    assert.equal(classPathText('de', 'pathsTitle'), 'Klassenpfade');
    assert.equal(classPathText('sv', 'pathsTitle'), 'Klassvägar');
    assert.equal(classPathText('unknown', 'pathsTitle'), 'Class paths');

    assert.equal(classPathText('it', 'current'), 'In corso');
    assert.equal(classPathText('en', 'current'), 'Current');
    assert.equal(classPathText('it', 'markDone'), 'Segna come completato');
    assert.equal(classPathText('it', 'notAvailable'), 'Non disponibile');
});


test('student class-paths parser keeps the automatic completion source', () => {
    const auto = parseStudentClassPathStep({ id: 1, tool_key: 'goals', state: 'done', source: 'automatic', can_self_mark: false });
    assert.equal(auto.state, 'done');
    assert.equal(auto.source, 'automatic');
    const unknown = parseStudentClassPathStep({ id: 2, tool_key: 'goals', state: 'done', source: 'robot' });
    assert.equal(unknown.source, null);
});

test('strict locked steps unlock after the current step, not the previous one', () => {
    const path = parseStudentClassPath({
        id: 3, group_id: 1, group_name: '3B', title: 'Strict', mode: 'strict',
        steps: [
            { id: 21, tool_key: 'bussola', state: 'done', source: 'automatic' },
            { id: 22, tool_key: 'QSA', state: 'unavailable' },
            { id: 23, tool_key: 'timeline', state: 'not_done' },
            { id: 24, tool_key: 'goals', state: 'locked' },
            { id: 25, tool_key: 'actions', state: 'locked' },
        ],
        next_step_id: 23, done: 1, total: 4,
    });
    assert.equal(lockedStepUnlockNumber(path), 3);
    assert.deepEqual(path.steps.map(s => s.state), ['done', 'unavailable', 'not_done', 'locked', 'locked']);
    assert.equal(lockedStepUnlockNumber({ ...path, next_step_id: null }), null);
    assert.equal(lockedStepUnlockNumber({ ...path, next_step_id: 999 }), null);
});

test('class paths translations name the automatic source in six languages', () => {
    assert.equal(classPathText('en', 'sourceAutomatic'), 'detected automatically');
    assert.equal(classPathText('it', 'sourceAutomatic'), 'rilevato automaticamente');
});

const progressPayload = {
    path_id: 7, group_id: 1, title: 'Start of year', mode: 'strict', status: 'published',
    published_at: '2026-10-01T09:00:00+00:00',
    steps: [
        { id: 1, position: 1, tool_key: 'goals', due_date: '2026-10-05', auto_detect: true, available: true, done_count: 1 },
        { id: 2, position: 2, tool_key: 'timeline', due_date: '2026-10-20', auto_detect: false, available: true, done_count: 1 },
        { id: 3, position: 3, tool_key: 'QSA', due_date: '2026-10-01', available: false, done_count: 0 },
    ],
    students: [
        {
            username: 'anna', display_name: 'Anna', done: 2, total: 2,
            cells: [
                { step_id: 1, state: 'done', source: 'automatic', at: null },
                { step_id: 2, state: 'done', source: 'teacher', at: '2026-10-08T10:00:00Z', actor: 'owner', reason: 'Seen in class', teacher_state: 'done' },
                { step_id: 3, state: 'unavailable', source: null },
            ],
        },
        {
            username: 'marco', display_name: 'Marco', done: 0, total: 2,
            cells: [
                { step_id: 1, state: 'not_done', source: 'teacher', teacher_state: 'not_done' },
                { step_id: 2, state: 'locked', source: 'robot' },
                { step_id: 3, state: 'unavailable', source: null },
            ],
        },
        {
            username: 'sara', display_name: 'Sara', done: 0, total: 2,
            cells: [
                { step_id: 1, state: 'not_done', source: null },
                { step_id: 2, state: 'not_done', source: null },
                { step_id: 3, state: 'unavailable', source: null },
            ],
        },
    ],
};

test('teacher progress parser keeps sources, overrides and unknown values safe', () => {
    const progress = parseClassPathProgress(progressPayload);
    assert.equal(progress.mode, 'strict');
    assert.deepEqual(progress.steps.map(s => [s.id, s.available, s.done_count]), [[1, true, 1], [2, true, 1], [3, false, 0]]);
    const [anna, marco] = progress.students;
    assert.equal(anna.cells[1].source, 'teacher');
    assert.equal(anna.cells[1].reason, 'Seen in class');
    assert.equal(anna.cells[1].teacher_state, 'done');
    assert.equal(anna.cells[0].teacher_state, null);
    assert.equal(marco.cells[1].state, 'locked');
    assert.equal(marco.cells[1].source, null);
    assert.equal(parseClassPathProgress({}).students.length, 0);
});

test('teacher progress filters late and not started students', () => {
    const progress = parseClassPathProgress(progressPayload);
    const names = (filter: 'all' | 'late' | 'not_started', today: string) =>
        filterProgressStudents(progress, filter, today).map(s => s.username);
    assert.deepEqual(names('all', '2026-10-09'), ['anna', 'marco', 'sara']);
    // Step 1 was due 10/05: Marco and Sara are late; unavailable step 3 never counts.
    assert.deepEqual(names('late', '2026-10-09'), ['marco', 'sara']);
    assert.deepEqual(names('late', '2026-10-05'), []);
    // Not started = no step done yet, whatever the marks say.
    assert.deepEqual(names('not_started', '2026-10-09'), ['marco', 'sara']);
});

test('progress cell codes use the a/s/t legend', () => {
    const [anna, marco] = parseClassPathProgress(progressPayload).students;
    assert.deepEqual(anna.cells.map(progressCellCode), ['✓a', '✓t', '—']);
    assert.deepEqual(marco.cells.map(progressCellCode), ['·t', '🔒', '—']);
});
