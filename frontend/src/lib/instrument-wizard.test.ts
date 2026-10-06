import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node runs TypeScript files directly.
import { sanitizeInstrumentCode, validateInstrumentCode, buildInstrumentPayload, buildInitialSteps, counselorNeedsUpdate, updatedCounselorTypes, executeCreateInstrument, INITIAL_WIZARD_FORM } from './instrument-wizard.ts';

test('sanitizeInstrumentCode trims, converts to uppercase and removes illegal chars', () => {
    assert.equal(sanitizeInstrumentCode('orienta test'), 'ORIENTA_TEST');
    assert.equal(sanitizeInstrumentCode('test-abc 123!'), 'TEST-ABC_123');
    assert.equal(sanitizeInstrumentCode('my_tool'), 'MY_TOOL');
});

test('validateInstrumentCode checks requirements', () => {
    assert.deepEqual(validateInstrumentCode(''), { valid: false, errorKey: 'codeRequired' });
    assert.deepEqual(validateInstrumentCode('   '), { valid: false, errorKey: 'codeRequired' });
    assert.deepEqual(validateInstrumentCode('A'), { valid: false, errorKey: 'codeLength' });
    assert.deepEqual(validateInstrumentCode('test!@#'), { valid: false, errorKey: 'codeInvalid' });
    assert.deepEqual(validateInstrumentCode('ORIENTA_TEST'), { valid: true });
    assert.deepEqual(validateInstrumentCode('ORIENTA-2026'), { valid: true });
});

test('buildInstrumentPayload builds clean payload with multilingua', () => {
    const form = {
        ...INITIAL_WIZARD_FORM,
        code: 'CAREER_EXPLORE',
        name_it: 'Esplorazione Carriera',
        name_en: 'Career Exploration',
        description_it: 'Un percorso per orientarsi.',
        description_en: 'A path for orientation.',
        tool_category: 'guided' as const,
        target_audience: 'student' as const,
        icon: 'compass' as const,
        color_theme: 'indigo',
        interview_mode: 'interactive' as const,
        is_active: false,
    };

    const payload = buildInstrumentPayload(form);
    assert.equal(payload.code, 'CAREER_EXPLORE');
    assert.equal(payload.name_it, 'Esplorazione Carriera');
    assert.equal(payload.name_en, 'Career Exploration');
    assert.deepEqual(payload.name_i18n, { it: 'Esplorazione Carriera', en: 'Career Exploration' });
    assert.deepEqual(payload.description_i18n, { it: 'Un percorso per orientarsi.', en: 'A path for orientation.' });
    assert.equal(payload.is_active, false);
    assert.equal(payload.tool_category, 'guided');
    assert.equal(payload.icon, 'compass');
    assert.equal(payload.color_theme, 'indigo');
});

test('buildInitialSteps generates expected steps for each template', () => {
    // 3 steps template
    const steps3 = buildInitialSteps('TEST_Q', 'three_steps', 'purple');
    assert.equal(steps3.length, 3);
    assert.equal(steps3[0].id, 'test_q_intro');
    assert.equal(steps3[0].questionnaire_type, 'TEST_Q');
    assert.equal(steps3[0].sort_order, 1);
    assert.equal(steps3[0].label, 'Introduzione');
    assert.equal(steps3[0].label_i18n.en, 'Introduction');
    assert.equal(steps3[0].color_theme, 'purple');

    assert.equal(steps3[1].id, 'test_q_explore');
    assert.equal(steps3[1].sort_order, 2);

    assert.equal(steps3[2].id, 'test_q_synthesis');
    assert.equal(steps3[2].sort_order, 3);

    // 1 step template
    const steps1 = buildInitialSteps('TEST_Q', 'single_step', 'blue');
    assert.equal(steps1.length, 1);
    assert.equal(steps1[0].id, 'test_q_chat');
    assert.equal(steps1[0].sort_order, 1);

    // Empty template
    const stepsEmpty = buildInitialSteps('TEST_Q', 'empty', 'blue');
    assert.equal(stepsEmpty.length, 0);
});

test('counselor associations check and update', () => {
    const c1 = { id: 1, questionnaire_types: ['QSA', 'ZTPI'] };
    const c2 = { id: 2, questionnaire_types: ['QSA', 'NEW_TOOL'] };

    assert.equal(counselorNeedsUpdate(c1, 'NEW_TOOL'), true);
    assert.equal(counselorNeedsUpdate(c2, 'NEW_TOOL'), false);

    assert.deepEqual(updatedCounselorTypes(c1, 'NEW_TOOL'), ['QSA', 'ZTPI', 'NEW_TOOL']);
    assert.deepEqual(updatedCounselorTypes(c2, 'NEW_TOOL'), ['QSA', 'NEW_TOOL']);
});

test('executeCreateInstrument performs creation sequence and updates counselors', async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    const mockFetcher = async (url: string, init?: RequestInit) => {
        calls.push({
            url,
            method: init?.method,
            body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        return {
            ok: true,
            status: 200,
            json: async () => ({}),
        } as Response;
    };

    const form = {
        ...INITIAL_WIZARD_FORM,
        code: 'MY_GUIDED',
        name_it: 'Percorso Guidato',
        template: 'three_steps' as const,
        selected_counselor_ids: [10],
    };

    const counselors = [
        { id: 10, name: 'Iride', slug: 'iride', questionnaire_types: ['QSA'] },
        { id: 20, name: 'Marco', slug: 'marco', questionnaire_types: ['QSA'] },
    ];

    const result = await executeCreateInstrument(form, counselors, mockFetcher);

    assert.equal(result.ok, true);
    assert.equal(result.code, 'MY_GUIDED');
    assert.equal(result.stepsCreated, 3);
    assert.equal(result.counselorsUpdated, 1);

    // 1 call to /api/admin/instruments
    // 3 calls to /api/admin/guided-steps
    // 1 call to /api/admin/counselors/10
    assert.equal(calls.length, 5);
    assert.equal(calls[0].url, '/api/admin/instruments');
    assert.equal(calls[1].url, '/api/admin/guided-steps');
    assert.equal(calls[2].url, '/api/admin/guided-steps');
    assert.equal(calls[3].url, '/api/admin/guided-steps');
    assert.equal(calls[4].url, '/api/admin/counselors/10');
    assert.deepEqual(calls[4].body, { questionnaire_types: ['QSA', 'MY_GUIDED'] });
});

test('executeCreateInstrument fails gracefully if instrument creation returns 400', async () => {
    const mockFetcher = async () => ({
        ok: false,
        status: 400,
        json: async () => ({ detail: "Instrument 'EXISTING' already exists" }),
    } as Response);

    const form = {
        ...INITIAL_WIZARD_FORM,
        code: 'EXISTING',
        name_it: 'Esistente',
    };

    const result = await executeCreateInstrument(form, [], mockFetcher);
    assert.equal(result.ok, false);
    assert.equal(result.error, "Instrument 'EXISTING' already exists");
});
