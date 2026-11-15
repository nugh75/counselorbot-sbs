import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// #960 (secondo audit visivo): adozione meccanica delle primitive nelle pagine
// MINORI del docente e nei pannelli condivisi. L'elenco dei file è quello del
// ticket: le pagine di un altro lotto restano fuori da questa guardia.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Solo il raggio/box delle Card è in gioco qui; i campi nativi di
// StepPresentationFields restano fuori perché il ticket chiede lì la sola taglia
// dei bottoni (le modali a mano le possiede il ticket della pagina classe).
const teacher = [
    'components/teacher/TeacherDevicesPanel.tsx',
    'components/teacher/InstitutesPanel.tsx',
    'components/teacher/AssignmentsPanel.tsx',
    'components/teacher/AssignmentWork.tsx',
];
const shared = [
    'components/forum/ForumView.tsx',
    'components/tavolo/TavoloWorkspace.tsx',
    'components/tavolo/TavoloCompose.tsx',
    'components/tavolo/TavoloCanvas.tsx',
    'app/docente/orientamento/page.tsx',
];
const admin = [
    'components/admin/CertifiedReadingsPanel.tsx',
    'components/admin/CertifiedStrategiesPanel.tsx',
    'components/admin/AdministrationPlansPanel.tsx',
    'components/admin/PlanStudentsPanel.tsx',
];
const all = [...teacher, ...shared, ...admin];

test('the owned panels have no boxed Card', () => {
    for (const file of [...teacher, 'components/forum/ForumView.tsx']) {
        assert.doesNotMatch(read(file), /<Card(?![^>]*variant="flat")[^>]*>/, file);
    }
});

test('fields are the shared Input/Select/Textarea, never hand-written borders', () => {
    // I pannelli admin tengono i loro <label> compatti: quello che conta è che il
    // campo non porti più bordo, altezza e focus scritti a mano.
    for (const file of all) {
        const source = read(file);
        assert.doesNotMatch(source, /<(?:input|select|textarea)\b[^>]*className="[^"]*\bborder\b/, file);
        assert.doesNotMatch(source, /outline-none/, file);
    }
});

test('status labels are StatusBadge, not hand-written pills', () => {
    for (const file of all) assert.doesNotMatch(read(file), /rounded-full[^"]*\bpx-/, file);
    for (const file of [
        'components/teacher/TeacherDevicesPanel.tsx',
        'components/teacher/AssignmentsPanel.tsx',
        'components/admin/AdministrationPlansPanel.tsx',
        'components/admin/PlanStudentsPanel.tsx',
    ]) {
        assert.match(read(file), /<StatusBadge\b/, file);
    }
});

test('two weights and no uppercase in the interface copy', () => {
    for (const file of all) {
        const source = read(file);
        assert.doesNotMatch(source, /\bfont-(?:medium|bold)\b/, file);
        // Il foglio stampabile dei piani (HTML con i suoi stili) non è interfaccia.
        if (file !== 'components/admin/AdministrationPlansPanel.tsx') assert.doesNotMatch(source, /\buppercase\b/, file);
    }
});

test('shadows stay on card, pop and modal', () => {
    for (const file of all) assert.doesNotMatch(read(file), /\bshadow-(?:sm|md|lg|xl|2xl)\b/, file);
});

test('the forum is on the semantic tokens', () => {
    assert.doesNotMatch(read('components/forum/ForumView.tsx'), /(?:text|bg|border|divide)-(?:slate|indigo|amber|red)-\d{2,3}|bg-white|prose-slate/);
});

test('the assignments dialog is the shared Dialog', () => {
    const source = read('components/teacher/AssignmentButton.tsx');
    assert.match(source, /<Dialog title=/);
    assert.match(source, /<DialogBody>/);
    assert.doesNotMatch(source, /<dialog|backdrop:bg-|fixed inset-0/);
});

test('tavolo keeps the piece tints but uses Button for its primary actions', () => {
    for (const file of ['components/tavolo/TavoloWorkspace.tsx', 'components/tavolo/TavoloCompose.tsx', 'components/tavolo/TavoloCanvas.tsx']) {
        assert.doesNotMatch(read(file), /bg-brand px-/, file);
    }
    assert.match(read('components/tavolo/TavoloCanvas.tsx'), /border-emerald-400 bg-emerald-50/);
});

test('teacher plans use the control size and the privacy pages one weight', () => {
    for (const file of ['components/teacher/ClassPathsTab.tsx', 'components/teacher/StepPresentationFields.tsx']) {
        assert.doesNotMatch(read(file), /size="sm"/, file);
    }
    for (const file of [
        'components/privacy/ConsentToggles.tsx',
        'components/privacy/ChoiceHistory.tsx',
        'components/privacy/SharingRevocation.tsx',
        'components/council/ClassCouncilView.tsx',
    ]) {
        assert.doesNotMatch(read(file), /\bfont-medium\b/, file);
    }
});