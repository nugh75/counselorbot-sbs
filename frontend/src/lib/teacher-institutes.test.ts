import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { parseTeacherInstitutes, parseInstituteChoices } from './teacher-institutes.ts';

test('unavailable or malformed institute responses cannot become a successful empty list', () => {
    for (const response of [null, {}, { detail: 'unavailable' }, [null], [{ id: '51', name: 'School', revision: 1 }]]) {
        assert.throws(() => parseTeacherInstitutes(response));
    }
    assert.deepEqual(parseTeacherInstitutes([]), []);
    assert.equal(parseTeacherInstitutes([{ id: 51, name: 'Synthetic', revision: 2 }])[0].name, 'Synthetic');
});

test('directory responses require explicit join availability; metadata alone cannot authorize joining', () => {
    assert.throws(() => parseInstituteChoices([{ id: 51, name: 'Synthetic' }]));
    const rows = parseInstituteChoices([{ id: 51, name: 'Synthetic', can_join: false, joined: true }]);
    assert.equal(rows[0].can_join, false);
});
