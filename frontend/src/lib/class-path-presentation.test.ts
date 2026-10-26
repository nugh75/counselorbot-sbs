import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { derivedStepTitle, effectiveDueDate, localIsoDate, resolveStepPresentation } from './class-path-presentation.ts';

const toolName = (key: string) => `tool:${key}`;

test('a tool step uses the tool name until the teacher overrides it', () => {
    const plain = resolveStepPresentation('it', {step_type: 'tool', tool_key: 'goals'}, {toolName});
    assert.equal(plain.title, 'tool:goals');
    assert.equal(plain.titleSource, 'target');
    assert.equal(plain.derivedTitle, 'tool:goals');

    const custom = resolveStepPresentation('it', {step_type: 'tool', tool_key: 'goals', title: '  Da dove parti?  '}, {toolName});
    assert.equal(custom.title, 'Da dove parti?');
    assert.equal(custom.titleSource, 'override');
    assert.equal(custom.derivedTitle, 'tool:goals');
});

test('a questionnaire step prefers the administration plan title over its code', () => {
    const titled = resolveStepPresentation('it', {
        step_type: 'questionnaire_administration',
        target_summary: {instrument_code: 'QSAr', code: 'AP-4SWO4Z', title: 'Strategie di apprendimento'},
    });
    assert.equal(titled.title, 'Strategie di apprendimento');

    const codeOnly = resolveStepPresentation('it', {
        step_type: 'questionnaire_administration',
        target_summary: {instrument_code: 'QSAr', code: 'AP-4SWO4Z'},
    });
    assert.equal(codeOnly.title, 'QSAr · AP-4SWO4Z');
});

test('an assignment step names the assignment and takes its deadline', () => {
    const presentation = resolveStepPresentation('it', {
        step_type: 'assignment',
        assignment_summary: {title: 'Un obiettivo per ottobre', due_date: '2026-10-31'},
    });
    assert.equal(presentation.title, 'Assegnazione · Un obiettivo per ottobre');
    assert.equal(presentation.dueDate, '2026-10-31');
    assert.equal(presentation.dueDateSource, 'assignment');
    assert.equal(presentation.showDueDate, true);
});

test('a meeting shows its own date in the details, not again as a deadline', () => {
    const presentation = resolveStepPresentation('it', {
        step_type: 'meeting',
        meeting_summary: {title: 'Incontro classe', starts_at: '2026-11-02T12:00:00Z'},
    });
    assert.equal(presentation.title, 'Incontro · Incontro classe');
    assert.equal(presentation.dueDate, localIsoDate('2026-11-02T12:00:00Z'));
    assert.equal(presentation.dueDateSource, 'meeting');
    assert.equal(presentation.showDueDate, false);

    const override = resolveStepPresentation('it', {
        step_type: 'meeting',
        due_date: '2026-11-06',
        meeting_summary: {title: 'Incontro classe', starts_at: '2026-11-02T12:00:00Z'},
    });
    assert.equal(override.dueDate, '2026-11-06');
    assert.equal(override.dueDateSource, 'override');
    assert.equal(override.showDueDate, true);
});

test('an individual meeting without a date keeps no date', () => {
    const presentation = resolveStepPresentation('it', {
        step_type: 'meeting',
        meeting_summary: {title: 'Colloquio', starts_at: null},
    });
    assert.equal(presentation.dueDate, null);
    assert.equal(presentation.dueDateSource, 'meeting');
    assert.equal(presentation.showDueDate, false);
});

test('a plan date is read from the administration summary', () => {
    const presentation = resolveStepPresentation('it', {
        step_type: 'questionnaire_administration',
        target_summary: {instrument_code: 'QSA', code: 'AP-1', scheduled_at: '2026-10-26T12:00:00Z'},
    });
    assert.equal(presentation.dueDate, '2026-10-26');
    assert.equal(presentation.dueDateSource, 'administration');
    // Shown once, as the planned day with its location.
    assert.equal(presentation.showDueDate, false);
});

test('date-only values never shift across timezones', () => {
    assert.equal(localIsoDate('2026-10-31'), '2026-10-31');
    assert.equal(effectiveDueDate({step_type: 'assignment', assignment_summary: {due_date: '2026-10-31'}}).value, '2026-10-31');
    assert.equal(localIsoDate(null), null);
    assert.equal(localIsoDate('not a date'), null);
});

test('a forum step needs its own title, because the discussion title never travels', () => {
    const bare = resolveStepPresentation('it', {step_type: 'forum'});
    assert.equal(bare.title, 'Discussione del forum');
    assert.equal(bare.titleSource, 'target');
    assert.equal(bare.note, null);

    const titled = resolveStepPresentation('it', {step_type: 'forum', title: 'Prima ipotesi, poi dati'});
    assert.equal(titled.title, 'Prima ipotesi, poi dati');
    assert.equal(titled.titleSource, 'override');
});

test('the note is trimmed and empty means no note', () => {
    assert.equal(resolveStepPresentation('it', {step_type: 'tool', instructions: '  Guarda i fattori  '}).note, 'Guarda i fattori');
    assert.equal(resolveStepPresentation('it', {step_type: 'tool', instructions: '   '}).note, null);
});

test('guided results chats name both sources', () => {
    const personal = resolveStepPresentation('it', {
        step_type: 'guided_results_chat',
        tool_key: 'QSAr',
        target_summary: {instrument_code: 'QSAr'},
    });
    assert.equal(personal.title, 'Analizza un questionario · QSAr · Da una compilazione personale');

    const plan = resolveStepPresentation('it', {
        step_type: 'guided_results_chat',
        target_summary: {instrument_code: 'QSAr', code: 'AP-4SWO4Z'},
    });
    assert.equal(plan.title, 'Approfondimento guidato dei risultati · QSAr · AP-4SWO4Z');
});

test('a pending step falls back to the template description and the editor fallback', () => {
    const pending = resolveStepPresentation('it', {
        step_type: 'pending',
        pending_config: {kind: 'questionnaire_administration', instrument_code: 'QSA', locale: 'it'},
    });
    assert.equal(pending.title, 'Somministrazione del questionario · QSA IT');

    const edited = resolveStepPresentation('it', {
        step_type: 'pending',
        pending_config: {kind: 'assignment'},
    }, {fallbackTitle: 'Attività della settimana'});
    assert.equal(edited.title, 'Attività della settimana');
});

test('derived titles ignore the saved override', () => {
    assert.equal(derivedStepTitle('it', {step_type: 'tool', tool_key: 'goals', title: 'Mio titolo'}, toolName), 'tool:goals');
});

for (const lang of ['it', 'en', 'es', 'fr', 'de', 'sv']) {
    test(`all step types resolve defaults, explicit overrides and reset in ${lang}`, () => {
        const steps = [
            {step_type: 'tool', tool_key: 'timeline'},
            {step_type: 'guided_chat', tool_key: 'SAVICKAS'},
            {step_type: 'guided_results_chat', tool_key: 'QSAr'},
            {step_type: 'guided_results_chat', target_summary: {instrument_code: 'QSAr', code: 'AP-1'}},
            {step_type: 'questionnaire_administration', target_summary: {title: 'Plan title'}},
            {step_type: 'assignment', assignment_summary: {title: 'Activity title'}},
            {step_type: 'forum'},
            {step_type: 'meeting', meeting_summary: {title: 'Meeting title'}},
            {step_type: 'pending', pending_config: {kind: 'forum' as const, title: 'Template discussion'}},
        ];
        for (const step of steps) {
            const plain = resolveStepPresentation(lang, step, {toolName});
            assert.ok(plain.title);
            const custom = resolveStepPresentation(lang, {...step, title: 'Personal', instructions: 'Class note', due_date: '2026-10-31'}, {toolName});
            assert.equal(custom.title, 'Personal');
            assert.equal(custom.note, 'Class note');
            assert.equal(custom.dueDate, '2026-10-31');
            assert.equal(resolveStepPresentation(lang, {...step, title: null, instructions: null, due_date: null}, {toolName}).title, plain.title);
        }
        assert.equal(resolveStepPresentation(lang, {step_type: 'questionnaire_administration', target_summary: {instrument_code: 'QSA'}}).dueDate, null);
    });
}

test('meeting calendar days follow the reader timezone, including midnight and DST', () => {
    const previous = process.env.TZ;
    try {
        for (const [zone, expected] of [['Europe/Stockholm', '2026-10-25'], ['America/Los_Angeles', '2026-10-24'], ['Pacific/Kiritimati', '2026-10-25']]) {
            process.env.TZ = zone;
            const step = {step_type: 'meeting', meeting_summary: {starts_at: '2026-10-24T23:30:00Z'}};
            assert.equal(effectiveDueDate(step).value, expected);
            assert.equal(localIsoDate('2026-10-24'), '2026-10-24');
        }
        process.env.TZ = 'Europe/Stockholm';
        assert.equal(localIsoDate('2026-03-29T22:30:00Z'), '2026-03-30');
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
});
