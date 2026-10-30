import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Zona 7b dell'audit UI (docs/audits/ui-consistency-audit-2026-10-30.md §7, §9):
// le pagine admin delle classi e dell'anteprima chat e i pannelli degli
// strumenti di sistema parlano solo token semantici. Gli hex rimasti sono i
// fogli HTML stampabili (codici dei piani e dei contatti di ricerca), che non
// ricevono le classi Tailwind, e il colore dei grafici Plotly: fuori da questa guardia.
const files = [
    '../app/admin/classi/page.tsx',
    '../app/admin/classi/[id]/page.tsx',
    '../app/admin/preview-chat/page.tsx',
    ...[
        'AdminClassesPanel', 'AdministrationPlansPanel', 'AudienceSwitches', 'AudioModelsPanel', 'BenchmarkPanel',
        'ChatGPTSettingsPanel', 'ConfigForm', 'ContentLanguageStatus', 'CostStats', 'DocumentRetrievalSettings',
        'ExternalPrivacySettings', 'GroupsPanel', 'InstitutionTeachers', 'LocalLlmDetect', 'LogViewer',
        'ModelContextSettings', 'ModelSearchSelect', 'OrientationReferralsPanel', 'PersonalAPIPolicy',
        'PlanStudentsPanel', 'ResearchContactsPanel', 'RolePreviewPanel', 'SurveyViewer', 'TrainingDatasetPanel',
        'UsersSummaryPanel', 'ValidationExportPanel',
    ].map(name => `../components/admin/${name}.tsx`),
];
const sources = files.map(name => ({ name, text: readFileSync(new URL(name, import.meta.url), 'utf-8') }));

function offending(pattern: RegExp): string[] {
    return sources.flatMap(({ name, text }) => [...text.matchAll(pattern)].map(m => `${m[0]} (${name})`));
}

test('admin system tools use semantic tokens instead of raw palettes', () => {
    // slate-900 e' il velo scuro dietro la finestra delle conversazioni.
    assert.deepEqual(offending(/(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border|ring|divide|accent)-(?:slate|gray|indigo|red|rose|amber|yellow|orange|emerald|green|sky|blue|teal|cyan|lime|violet|purple|fuchsia)-\d{2,3}(?![\w-])/g)
        .filter(hit => !/^bg-slate-900 /.test(hit)), []);
});

test('admin system tools follow the visual principles', () => {
    assert.deepEqual(offending(/(?<![\w:-])(?:uppercase|tracking-wid\w+|font-(?:medium|bold|extrabold)|bg-(?:gradient|linear)-[\w-]+|backdrop-blur[\w-]*|glass-panel|dark:[\w:/[\]-]+|text-\[1[01]px\])(?![\w-])/g), []);
    assert.deepEqual(offending(/(?<![\w-])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(?:0\.5|1\.5|2\.5|3\.5|3|5|7|9|11)(?![\w.-])/g), []);
});

test('admin system tools size controls on the 44px token', () => {
    assert.deepEqual(offending(/(?<![\w-])(?:min-h-11|h-11|min-h-\[44px\])(?![\w-])/g), []);
});

test('admin system tools confirm deletions inline', () => {
    // Restano native solo le domande dentro il salvataggio dei piani (archivio e
    // sostituzione), passate come callback alle funzioni di lib/administration-plans.
    assert.deepEqual(offending(/(?<![\w.])(?:window\.)?confirm\(/g).filter(hit => !hit.endsWith('(../components/admin/AdministrationPlansPanel.tsx)')), []);
    const plans = sources.find(({ name }) => name.endsWith('AdministrationPlansPanel.tsx'))!.text;
    assert.equal([...plans.matchAll(/window\.confirm\(/g)].length, 3);
});
