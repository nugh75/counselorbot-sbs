import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// L'appartenenza di uno strumento vive in liste sparse: dimenticarne una non
// rompe niente, lo strumento sparisce e basta da quel pezzo di app. Ogni lista
// che nomina SAVICKAS deve nominare anche i due Evento significativo.
const LISTS = [
    '../app/questionario/page.tsx',
    '../app/strumenti/[id]/page.tsx',
    '../components/qsa/ProfileVisualization.tsx',
    '../components/admin/CounselorsPanel.tsx',
    '../components/admin/SkillsPanel.tsx',
    '../components/admin/PromptExportPanel.tsx',
    '../components/admin/LogViewer.tsx',
    '../components/admin/QuestionnaireResultsViewer.tsx',
];

// Fuori di proposito: niente letture certificate per gli eventi, e un evento
// non e' un profilo da sommare agli altri.
// - components/admin/CertifiedReadingsPanel.tsx
// - lib/profile-tracker.ts, app/profilo/page.tsx (addCompletedProfile)

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('every instrument list that names Savickas names both significant-event paths', () => {
    for (const path of LISTS) {
        const lists = read(path).split('\n').filter((line) => /\[.*'SAVICKAS'.*\]/.test(line));
        assert.ok(lists.length > 0, `${path}: no instrument list found`);
        for (const line of lists) {
            assert.ok(line.includes("'EVENTO_STUDIO'") && line.includes("'EVENTO_PROFESSIONALE'"), `${path}: ${line.trim()}`);
        }
    }
});

test('the catalog, the admin prompt sections and the suggested questions include both paths', () => {
    const catalog = read('./tool-catalog.ts');
    assert.equal(catalog.match(/'EVENTO_STUDIO'/g)?.length, 2);
    assert.equal(catalog.match(/'EVENTO_PROFESSIONALE'/g)?.length, 2);
    const config = read('../components/admin/ConfigForm.tsx');
    assert.ok(config.includes("questionnaireType: 'EVENTO_STUDIO'") && config.includes("questionnaireType: 'EVENTO_PROFESSIONALE'"));
    assert.ok(config.includes("'evento-interview': 'prompt_evento_interview'"));
    const questions = read('../components/admin/GuidedStepQuestionsPanel.tsx');
    assert.ok(questions.includes('EVENTO_STUDIO: [') && questions.includes('EVENTO_PROFESSIONALE: ['));
});
