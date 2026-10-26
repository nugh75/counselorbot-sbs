import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildClassResultsMatrix, formatCompactScores, type PlanStudent } from './class-results-matrix.ts';

test('buildClassResultsMatrix handles empty student list', () => {
    const matrix = buildClassResultsMatrix([]);
    assert.deepEqual(matrix.instruments, []);
    assert.deepEqual(matrix.rows, []);
    assert.deepEqual(matrix.totalsByInstrument, {});
    assert.equal(matrix.totalStudents, 0);
});

test('buildClassResultsMatrix handles students with no submissions', () => {
    const students: PlanStudent[] = [
        { username: 'student.a', telegram_linked: false, learner_profile: null, results: [] },
        { username: 'student.b', telegram_linked: true, learner_profile: null, results: [] },
    ];
    const matrix = buildClassResultsMatrix(students);
    assert.deepEqual(matrix.instruments, []);
    assert.equal(matrix.totalStudents, 2);
    assert.equal(matrix.rows.length, 2);
    assert.equal(matrix.rows[0].totalCompleted, 0);
    assert.equal(matrix.rows[1].telegram_linked, true);
});

test('buildClassResultsMatrix aggregates multi-instrument submissions and picks latest', () => {
    const students: PlanStudent[] = [
        {
            username: 'alice',
            telegram_linked: true,
            learner_profile: null,
            results: [
                { id: 1, session_id: 's1', questionnaire_type: 'QSA', scores: { C1: 5 }, submitted_at: '2026-10-01T10:00:00Z' },
                { id: 2, session_id: 's2', questionnaire_type: 'QSA', scores: { C1: 8 }, submitted_at: '2026-10-10T12:00:00Z' },
                { id: 3, session_id: 's3', questionnaire_type: 'QPCC', scores: { F1: 3 }, submitted_at: '2026-10-05T09:00:00Z' },
            ],
        },
        {
            username: 'bob',
            telegram_linked: false,
            learner_profile: null,
            results: [
                { id: 4, session_id: 's4', questionnaire_type: 'QSA', scores: { C1: 6 }, submitted_at: '2026-10-02T11:00:00Z' },
            ],
        },
        {
            username: 'charlie',
            telegram_linked: false,
            learner_profile: null,
            results: [],
        },
    ];

    const matrix = buildClassResultsMatrix(students);
    assert.deepEqual(matrix.instruments, ['QPCC', 'QSA']);
    assert.equal(matrix.totalStudents, 3);
    assert.equal(matrix.totalsByInstrument['QPCC'], 1);
    assert.equal(matrix.totalsByInstrument['QSA'], 2);

    // Alice: latest QSA is id 2 (submitted on 2026-10-10)
    const aliceRow = matrix.rows[0];
    assert.equal(aliceRow.username, 'alice');
    assert.equal(aliceRow.telegram_linked, true);
    assert.equal(aliceRow.totalCompleted, 2);
    assert.equal(aliceRow.cells['QSA'].results.length, 2);
    assert.equal(aliceRow.cells['QSA'].latest?.id, 2);
    assert.deepEqual(aliceRow.cells['QSA'].latest?.scores, { C1: 8 });
    assert.equal(aliceRow.cells['QPCC'].latest?.id, 3);

    // Bob: completed only QSA
    const bobRow = matrix.rows[1];
    assert.equal(bobRow.totalCompleted, 1);
    assert.equal(bobRow.cells['QSA'].latest?.id, 4);
    assert.equal(bobRow.cells['QPCC'].latest, null);

    // Charlie: completed none
    const charlieRow = matrix.rows[2];
    assert.equal(charlieRow.totalCompleted, 0);
    assert.equal(charlieRow.cells['QSA'].latest, null);
    assert.equal(charlieRow.cells['QPCC'].latest, null);
});

test('formatCompactScores formats and limits entries', () => {
    assert.equal(formatCompactScores(null), '');
    assert.equal(formatCompactScores({}), '');
    assert.equal(formatCompactScores({ C1: 7 }), 'C1:7');
    assert.equal(formatCompactScores({ B: 2, A: 1 }), 'A:1 B:2');
    assert.equal(formatCompactScores({ D: 4, C: 3, B: 2, A: 1 }, 3), 'A:1 B:2 C:3…');
    assert.equal(formatCompactScores({ D: 4, C: 3, B: 2, A: 1 }, 4), 'A:1 B:2 C:3 D:4');
});
