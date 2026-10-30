import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Zona 7a dell'audit UI (docs/audits/ui-consistency-audit-2026-10-30.md §7, §9):
// la pagina admin e i pannelli dei contenuti parlano solo token semantici.
// Le palette dei colori scelti per counselor e strumenti (COLOR_SWATCH,
// COLOR_DOT) e i tipi di nodo della mappa dei prompt restano tinte di
// distinzione, non stati: sono fuori da questa guardia.
const files = [
    '../app/admin/page.tsx',
    ...[
        'AdminChatSandbox', 'AdminChatSandboxModal', 'ApprovedStrategiesPanel', 'AssistantAdminPanel',
        'AssistantQuestionsPanel', 'CertifiedReadingsPanel', 'CertifiedStrategiesPanel', 'CounselorCoverModal',
        'CounselorsPanel', 'CreateInstrumentDialog', 'GuidedStepQuestionsPanel', 'PqblAdminPanel', 'PresetsPanel',
        'PromptExperimentContext', 'PromptExperimentsPanel', 'PromptExportPanel', 'PromptFactoryAlignment',
        'PromptHistory', 'PromptMap', 'PromptRequestPreview', 'QuestionnaireEditor', 'QuestionnaireResultsViewer',
        'RagDocsPanel', 'SectionFilter', 'SkillsPanel', 'SkillWizard', 'TavoloImagesPanel', 'ThreadGuardPanel',
        'ToolBriefsPanel',
    ].map(name => `../components/admin/${name}.tsx`),
];
const sources = files.map(name => ({ name, text: readFileSync(new URL(name, import.meta.url), 'utf-8') }));

function offending(pattern: RegExp): string[] {
    return sources.flatMap(({ name, text }) => [...text.matchAll(pattern)].map(m => `${m[0]} (${name})`));
}

test('admin content panels use semantic tokens instead of slate/indigo/status palettes', () => {
    // -500 sono i pallini delle palette scelte; slate-900 e' il velo scuro delle finestre modali.
    assert.deepEqual(offending(/(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border|ring|divide)-(?:slate|indigo|red|amber|emerald|green|sky)-\d{2,3}(?![\w-])/g)
        .filter(hit => !/^bg-(?:\w+-500|slate-900) /.test(hit)), []);
});

test('admin content panels follow the visual principles', () => {
    assert.deepEqual(offending(/(?<![\w-])(?:uppercase|font-(?:medium|bold|extrabold)|bg-(?:gradient|linear)-[\w-]+|backdrop-blur[\w-]*|dark:[\w:/[\]-]+|text-\[1[01]px\])(?![\w-])/g), []);
    assert.deepEqual(offending(/(?<![\w-])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(?:0\.5|1\.5|2\.5|3\.5|3|5|7|9|11)(?![\w.-])/g), []);
});

test('admin content panels confirm inline instead of window.confirm', () => {
    assert.deepEqual(offending(/(?<![\w.])(?:window\.)?confirm\(/g), []);
});
