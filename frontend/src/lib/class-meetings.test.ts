import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { fromLocalInput, meetingHost, meetingWhen, parseMeeting, parseMeetings, toLocalInput } from './class-meetings.ts';
// @ts-expect-error -- Node runs TypeScript files directly.
import { parseClassPathStep } from './class-paths.ts';

const meeting = { id: 4, group_id: 11, title: 'Debriefing', starts_at: '2026-10-12T08:00:00+00:00', duration_minutes: 60,
    mode: 'online', place: null, link: 'https://meet.example.invalid/4', status: 'scheduled', revision: 2 };

test('meetings keep web links only and reject malformed rows', () => {
    assert.equal(parseMeeting(meeting)?.link, 'https://meet.example.invalid/4');
    assert.equal(parseMeeting({ ...meeting, link: 'javascript:alert(1)' })?.link, null);
    assert.equal(parseMeeting({ ...meeting, starts_at: null }), null);
    assert.equal(parseMeetings([meeting, null, { id: 'x' }]).length, 1);
});

test('meeting time reads in the user language with its end', () => {
    assert.match(meetingWhen(meeting, 'en'), /2026.*–/);
    assert.equal(fromLocalInput(toLocalInput(meeting.starts_at)), new Date(meeting.starts_at).toISOString());
    assert.equal(fromLocalInput('not a date'), null);
});

test('a meeting step carries its meeting summary, not an administration target', () => {
    const step = parseClassPathStep({ id: 9, position: 1, step_type: 'meeting', meeting_id: 4, target_summary: meeting });
    assert.equal(step.step_type, 'meeting');
    assert.equal(step.meeting_id, 4);
    assert.equal(step.meeting_summary?.title, 'Debriefing');
    assert.equal(step.target_summary, null);
});

test('individual meetings have slots instead of a date and name their host', () => {
    const individual = parseMeeting({ ...meeting, kind: 'individual', starts_at: null, host_kind: 'expert', host_name: 'Dott.ssa Rossi',
        host_role: 'Psicologa', booking_slot_id: 2, booking_cancelled: false,
        slots: [{ id: 2, starts_at: '2026-11-05T09:00:00+00:00', duration_minutes: 15, mine: true }, { id: 'x' }] });
    assert.equal(individual?.starts_at, null);
    assert.deepEqual(individual?.slots?.map(slot => [slot.id, slot.mine]), [[2, true]]);
    assert.equal(meetingHost(individual!), 'Dott.ssa Rossi, Psicologa');
    assert.equal(meetingHost({ host_kind: 'teacher', host_name: null, host_role: null }), null);
    assert.equal(meetingWhen({ starts_at: null, duration_minutes: null }, 'it'), '');
    // A group meeting without its date is malformed.
    assert.equal(parseMeeting({ ...meeting, starts_at: null }), null);
});
