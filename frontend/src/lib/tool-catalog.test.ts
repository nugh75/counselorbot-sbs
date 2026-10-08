import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { ACTIVE_QUESTIONNAIRE_IDS, TEACHER_AREA_INSTRUMENT_IDS, TOOL_CATEGORIES, isStartableQuestionnaireId, orientationSkippedThisVisit, skipOrientationThisVisit, resolveActiveStudentTools, getDynamicToolCategories } from './tool-catalog.ts';
import type { InstrumentSummary } from './instruments-api';

test('every active questionnaire appears in exactly one home category, or is the declared teacher-area exception', () => {
    const categorized = TOOL_CATEGORIES.flatMap((group) => group.questionnaireIds);
    const accounted = [...categorized, ...TEACHER_AREA_INSTRUMENT_IDS];
    assert.deepEqual([...accounted].sort(), [...ACTIVE_QUESTIONNAIRE_IDS].sort());
    assert.equal(new Set(categorized).size, categorized.length);
    // L'eccezione è dell'area docenti: lo strumento non può stare anche in
    // una categoria studente.
    for (const id of TEACHER_AREA_INSTRUMENT_IDS) {
        assert.equal(categorized.includes(id), false);
    }
});

test('deep-link validation uses the shared active catalog and dynamic instruments', () => {
    assert.equal(isStartableQuestionnaireId('QSA'), true);
    assert.equal(isStartableQuestionnaireId('UNKNOWN'), false);

    const catalog: InstrumentSummary[] = [
        {
            code: 'ORIENTA_TEST',
            name_i18n: { it: 'Orienta Test' },
            status: 'certified',
            report_scale_type: 'stanine',
            item_count: 0,
            locales: { it: 'certified' },
            available_locales: ['it'],
            is_active: true,
            tool_category: 'guided',
        },
        {
            code: 'DRAFT_TOOL',
            name_i18n: { it: 'Draft Tool' },
            status: 'draft',
            report_scale_type: 'stanine',
            item_count: 0,
            locales: {},
            available_locales: [],
            is_active: false,
            tool_category: 'guided',
        },
    ];

    assert.equal(isStartableQuestionnaireId('ORIENTA_TEST', catalog), true);
    assert.equal(isStartableQuestionnaireId('DRAFT_TOOL', catalog), false);
    assert.equal(isStartableQuestionnaireId('NON_EXISTENT', catalog), false);
});

test('resolveActiveStudentTools includes dynamic active tools and excludes inactive or teacher tools', () => {
    const catalog: InstrumentSummary[] = [
        {
            code: 'DYNAMIC_GUIDED',
            name_i18n: { it: 'Percorso Dinamico', en: 'Dynamic Path' },
            description_i18n: { it: 'Descrizione percorso', en: 'Path description' },
            status: 'certified',
            report_scale_type: 'stanine',
            item_count: 0,
            locales: { it: 'certified' },
            available_locales: ['it', 'en'],
            is_active: true,
            tool_category: 'guided',
            target_audience: 'student',
            icon: 'lightbulb',
            color_theme: 'amber',
        },
        {
            code: 'DYNAMIC_INACTIVE',
            name_i18n: { it: 'Percorso Inattivo' },
            status: 'draft',
            report_scale_type: 'stanine',
            item_count: 0,
            locales: {},
            available_locales: [],
            is_active: false,
            tool_category: 'guided',
            target_audience: 'student',
        },
        {
            code: 'DYNAMIC_TEACHER',
            name_i18n: { it: 'Strumento Docente' },
            status: 'certified',
            report_scale_type: 'stanine',
            item_count: 0,
            locales: { it: 'certified' },
            available_locales: ['it'],
            is_active: true,
            tool_category: 'guided',
            target_audience: 'teacher',
        },
    ];

    const activeTools = resolveActiveStudentTools(catalog, 'it');
    const ids = activeTools.map((t) => t.id);

    // Dynamic active student tool is present
    assert.equal(ids.includes('DYNAMIC_GUIDED'), true);
    // Inactive tool is excluded for students (DoD)
    assert.equal(ids.includes('DYNAMIC_INACTIVE'), false);
    // Teacher-targeted tool is excluded from student catalog
    assert.equal(ids.includes('DYNAMIC_TEACHER'), false);
    // Static teacher tool OBIETTIVO_DOCENZA is excluded
    assert.equal(ids.includes('OBIETTIVO_DOCENZA'), false);

    // Check mapped properties
    const guidedTool = activeTools.find((t) => t.id === 'DYNAMIC_GUIDED');
    assert.ok(guidedTool);
    assert.equal(guidedTool.name, 'Percorso Dinamico');
    assert.equal(guidedTool.description, 'Descrizione percorso');
    assert.equal(guidedTool.agentOnly, true);
    assert.equal(guidedTool.icon, 'lightbulb');
    assert.equal(guidedTool.color, 'bg-amber-500');

    // Dynamic categorization
    const categories = getDynamicToolCategories(activeTools, catalog);
    const guidedGroup = categories.find((c) => c.id === 'guided');
    assert.ok(guidedGroup);
    assert.equal(guidedGroup.questionnaireIds.includes('DYNAMIC_GUIDED'), true);
});

test('resolveActiveStudentTools keeps only class-enabled tools when access is restricted', () => {
    const catalog: InstrumentSummary[] = [{
        code: 'DYN_ON', name_i18n: { it: 'Dyn On' }, status: 'certified', report_scale_type: 'stanine',
        item_count: 0, locales: {}, available_locales: [], is_active: true, tool_category: 'guided', target_audience: 'student',
    }, {
        code: 'DYN_OFF', name_i18n: { it: 'Dyn Off' }, status: 'certified', report_scale_type: 'stanine',
        item_count: 0, locales: {}, available_locales: [], is_active: true, tool_category: 'guided', target_audience: 'student',
    }];
    const base = { counselor_ids: null, default_counselor_id: null };
    const restricted = { ...base, restricted: true, tool_keys: ['SAVICKAS', 'DYN_ON', 'notebook'], class_ids: [1] };
    const ids = resolveActiveStudentTools(catalog, 'it', restricted).map((t) => t.id);
    assert.deepEqual([...ids].sort(), ['DYN_ON', 'SAVICKAS']);

    // Unrestricted access (staff, no class) and missing access change nothing.
    const unrestricted = { ...base, restricted: false, tool_keys: [], class_ids: [] };
    const all = resolveActiveStudentTools(catalog, 'it').map((t) => t.id);
    assert.deepEqual(resolveActiveStudentTools(catalog, 'it', unrestricted).map((t) => t.id), all);
    assert.equal(all.includes('DYN_OFF'), true);
    assert.equal(all.includes('QSA'), true);
});

function withStorage(impl: Record<string, unknown> | undefined, run: () => void) {
    const kept = (globalThis as { sessionStorage?: unknown }).sessionStorage;
    (globalThis as { sessionStorage?: unknown }).sessionStorage = impl;
    try { run(); } finally { (globalThis as { sessionStorage?: unknown }).sessionStorage = kept; }
}

function memoryStorage() {
    const store: Record<string, string> = {};
    return {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => { store[key] = value; },
    };
}

test('the compass is not skipped until someone skips it, and then stays skipped', () => {
    withStorage(memoryStorage(), () => {
        assert.equal(orientationSkippedThisVisit(), false);
        skipOrientationThisVisit();
        assert.equal(orientationSkippedThisVisit(), true);
    });
});

test('a storage that refuses to answer does not turn the skip into a broken screen', () => {
    withStorage({
        getItem() { throw new Error('storage disabled'); },
        setItem() { throw new Error('storage disabled'); },
    }, () => {
        assert.doesNotThrow(() => skipOrientationThisVisit());
        assert.equal(orientationSkippedThisVisit(), false);
    });
});
