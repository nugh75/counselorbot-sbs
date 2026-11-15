import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Notices, field focus and headings of the areas (#931) use the shared pieces.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const callouts = [
    'app/profilo/page.tsx', 'app/profilo/pqbl/page.tsx', 'app/docente/orientamento/page.tsx',
    'components/profile/MyGroupsCard.tsx', 'components/profile/PortfolioCard.tsx',
    'components/flashcards/FlashcardsPage.tsx', 'components/visual/VisualPersonalTransfer.tsx',
    'components/visual/VisualTools.tsx',
    'components/teacher/ClassOverviewTab.tsx', 'components/teacher/ClassCouncilTab.tsx',
    'components/teacher/ClassImageModal.tsx', 'components/teacher/ClassNoticingTab.tsx',
    'components/admin/CounselorCoverModal.tsx', 'components/admin/AdministrationPlansPanel.tsx',
    'components/admin/AudioModelsPanel.tsx',
    'components/admin/ResearchContactsPanel.tsx', 'components/admin/TavoloImagesPanel.tsx',
    'components/admin/TrainingDatasetPanel.tsx', 'components/admin/ValidationExportPanel.tsx',
    'components/admin/QuestionnaireEditor.tsx', 'components/admin/CreateInstrumentDialog.tsx',
    'components/admin/PromptMap.tsx',
];

test('converted notices use the shared Callout', () => {
    for (const file of callouts) {
        const source = read(file);
        assert.match(source, /<Callout\b/, file);
        assert.match(source, /from '@\/components\/ui\/Callout'/, file);
    }
});

test('audited admin and profile fields keep the global focus ring', () => {
    for (const file of ['LogViewer', 'CostStats', 'AdministrationPlansPanel', 'AssistantQuestionsPanel', 'ApprovedStrategiesPanel', 'CreateInstrumentDialog', 'CounselorCoverModal']) {
        assert.doesNotMatch(read(`components/admin/${file}.tsx`), /(?<![:\w-])outline-none/, file);
    }
    assert.doesNotMatch(read('app/profilo/page.tsx'), /bg-transparent text-sm outline-none/);
});

test('headings use text-lg semibold and the practice help is text-sm', () => {
    assert.doesNotMatch(read('components/forum/ForumView.tsx'), /font-bold/);
    assert.doesNotMatch(read('components/teacher/PracticeNotebooks.tsx'), /<h2[^>]*text-xl/);
    for (const file of ['PracticeNotebooks', 'PracticeChats', 'PracticeRepertoire']) {
        assert.doesNotMatch(read(`components/teacher/${file}.tsx`), /<p className="text-xs text-ink-muted">/, file);
    }
});
