import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node direct typescript execution requires extension
import { filterCounselorsByCategories, getCounselorTagline, type PublicCounselor } from './counselor.ts';
// @ts-expect-error -- Node direct typescript execution requires extension
import { formatCategoryLabel } from './i18n-counselor-identity.ts';

const counselorSelectorSource = () =>
    readFileSync(new URL('../components/questionnaire/CounselorSelector.tsx', import.meta.url), 'utf8');

test('getCounselorTagline returns requested language and falls back correctly', () => {
    const counselor: PublicCounselor = {
        id: 1,
        slug: 'marco',
        name: 'Marco',
        language: ['it', 'en'],
        tagline: 'Tagline predefinita',
        tagline_i18n: {
            it: 'Ti accompagna con domande calme e precise.',
            en: 'Accompanies you with calm, precise questions.',
            es: 'Te acompaña con domande che aiutano a chiarire le idee.',
        },
        approach_categories: ['filosofo', 'maieutico'],
        approach_summary: 'Sommario approccio maieutico',
        description: 'Descrizione classica',
    };

    // Lingua richiesta presente
    assert.equal(getCounselorTagline(counselor, 'it'), 'Ti accompagna con domande calme e precise.');
    assert.equal(getCounselorTagline(counselor, 'en'), 'Accompanies you with calm, precise questions.');
    assert.equal(getCounselorTagline(counselor, 'es'), 'Te acompaña con domande che aiutano a chiarire le idee.');

    // Lingua non presente nel dict: fallback su 'it' o prima lingua disponibile
    assert.equal(getCounselorTagline(counselor, 'de'), 'Ti accompagna con domande calme e precise.');

    // Solo tagline stringa
    const cTaglineOnly: PublicCounselor = {
        id: 2,
        slug: 'sara',
        name: 'Sara',
        language: ['it'],
        tagline: 'Uno spazio accogliente ed empatico.',
    };
    assert.equal(getCounselorTagline(cTaglineOnly, 'en'), 'Uno spazio accogliente ed empatico.');

    // Solo approach_summary
    const cSummaryOnly: PublicCounselor = {
        id: 3,
        slug: 'luca',
        name: 'Luca',
        language: ['it'],
        approach_summary: 'Approccio pratico e diretto.',
    };
    assert.equal(getCounselorTagline(cSummaryOnly, 'fr'), 'Approccio pratico e diretto.');

    // Solo description
    const cDescOnly: PublicCounselor = {
        id: 4,
        slug: 'elena',
        name: 'Elena',
        language: ['it'],
        description: 'Domande socratiche.',
    };
    assert.equal(getCounselorTagline(cDescOnly, 'sv'), 'Domande socratiche.');
});

test('formatCategoryLabel translates categories across supported languages', () => {
    assert.equal(formatCategoryLabel('filosofo', 'it'), 'Filosofo');
    assert.equal(formatCategoryLabel('filosofo', 'en'), 'Philosopher');
    assert.equal(formatCategoryLabel('filosofo', 'es'), 'Filósofo');
    assert.equal(formatCategoryLabel('filosofo', 'fr'), 'Philosophe');
    assert.equal(formatCategoryLabel('filosofo', 'de'), 'Philosoph');
    assert.equal(formatCategoryLabel('filosofo', 'sv'), 'Filosof');

    assert.equal(formatCategoryLabel('psicologo', 'en'), 'Psychologist');
    assert.equal(formatCategoryLabel('psicologo', 'es'), 'Psicólogo');
    assert.equal(formatCategoryLabel('psicologo', 'de'), 'Psychologe');

    assert.equal(formatCategoryLabel('docente', 'en'), 'Teacher');
    assert.equal(formatCategoryLabel('docente', 'fr'), 'Enseignant');
    assert.equal(formatCategoryLabel('docente', 'de'), 'Lehrkraft');

    assert.equal(formatCategoryLabel('tutor', 'sv'), 'Handledare');
    assert.equal(formatCategoryLabel('tutor', 'fr'), 'Tuteur');

    assert.equal(formatCategoryLabel('maieutico', 'en'), 'Socratic');
    assert.equal(formatCategoryLabel('pragmatico', 'en'), 'Pragmatic');
    assert.equal(formatCategoryLabel('empatico', 'de'), 'Empathisch');
    assert.equal(formatCategoryLabel('analitico', 'fr'), 'Analytique');
    assert.equal(formatCategoryLabel('motivazionale', 'es'), 'Motivacional');
    assert.equal(formatCategoryLabel('metodico', 'it'), 'Metodico');

    // Categoria sconosciuta con fallback capitalizzato
    assert.equal(formatCategoryLabel('creativo', 'it'), 'Creativo');
});

test('CounselorSelector source satisfies UI requirements and compatibility contracts', () => {
    const src = counselorSelectorSource();

    // 1. Ricerca per approccio
    assert.match(src, /t\('counselor\.search\.label'\)/);
    assert.match(src, /t\('counselor\.search\.placeholder'\)/);
    assert.match(src, /t\('counselor\.search\.button'\)/);
    assert.match(src, /recommendCounselor/);
    assert.match(src, /handleSearchSubmit/);

    // 2. Scheda di raccomandazione con motivazione e selezione
    assert.match(src, /recommendation\?\.counselor/);
    assert.match(src, /recommendation\.explanation/);
    assert.match(src, /recommendation\.matched_categories/);

    // 3. Filtro per categorie di approccio (chip multi-tag)
    assert.match(src, /t\('counselor\.filter\.label'\)/);
    assert.match(src, /t\('counselor\.filter\.all'\)/);
    assert.match(src, /t\('counselor\.filter\.reset'\)/);
    assert.match(src, /selectedCategories/);
    assert.match(src, /toggleCategory/);
    assert.match(src, /clearCategories/);
    assert.match(src, /formatCategoryLabel/);
    assert.match(src, /filterCounselorsByCategories/);

    // 4. Frase distintiva (tagline) e avatar nelle card
    assert.match(src, /getCounselorTagline\(c, lang\)/);
    assert.match(src, /c\.approach_categories/);
    assert.match(src, /c\.avatar_url/);

    // 5. Conservazione contratti di selezione (single-click e double-click)
    assert.match(src, /onClick=\{\(\) => choose\(c\)\}/);
    assert.match(src, /onDoubleClick=\{\(\) => \{\s*if \(disabled \|\| busy\) return;\s*choose\(c\);\s*if \(onContinue\) onContinue\(c\.id\);\s*\}\}/);

    // 6. Visualizzazione modello AI
    assert.match(src, /c\.model &&/);
    assert.match(src, /counselor\.modelLabel/);
    assert.match(src, /\{c\.model\}/);
});

test('filterCounselorsByCategories returns all counselors when selectedCategories is empty', () => {
    const list: PublicCounselor[] = [
        { id: 1, slug: 'c1', name: 'Counselor 1', language: ['it'], approach_categories: ['filosofo'] },
        { id: 2, slug: 'c2', name: 'Counselor 2', language: ['it'], approach_categories: ['psicologo'] },
    ];

    assert.deepEqual(filterCounselorsByCategories(list, []), list);
    assert.deepEqual(filterCounselorsByCategories(list, ['  ', '']), list);
});

test('filterCounselorsByCategories filters by single category with case insensitivity', () => {
    const list: PublicCounselor[] = [
        { id: 1, slug: 'c1', name: 'Counselor 1', language: ['it'], approach_categories: ['Filosofo', 'Maieutico'] },
        { id: 2, slug: 'c2', name: 'Counselor 2', language: ['it'], approach_categories: ['Psicologo'] },
        { id: 3, slug: 'c3', name: 'Counselor 3', language: ['it'], approach_categories: ['filosofo'] },
    ];

    const filtered = filterCounselorsByCategories(list, ['filosofo']);
    assert.equal(filtered.length, 2);
    assert.deepEqual(filtered.map((c) => c.id), [1, 3]);
});

test('filterCounselorsByCategories multi-tag filtering requires all selected tags (AND logic)', () => {
    const list: PublicCounselor[] = [
        { id: 1, slug: 'c1', name: '1 Match', language: ['it'], approach_categories: ['filosofo'] },
        { id: 2, slug: 'c2', name: '3 Matches Full', language: ['it'], approach_categories: ['filosofo', 'docente', 'tutor'] },
        { id: 3, slug: 'c3', name: '0 Matches', language: ['it'], approach_categories: ['psicologo', 'analitico'] },
        { id: 4, slug: 'c4', name: '2 Matches Partial', language: ['it'], approach_categories: ['docente', 'tutor'] },
        { id: 5, slug: 'c5', name: 'All Matches + Extra', language: ['it'], approach_categories: ['filosofo', 'docente', 'tutor', 'empatico'] },
    ];

    const selectedTags = ['filosofo', 'docente', 'tutor'];
    const filtered = filterCounselorsByCategories(list, selectedTags);

    // Solo i counselor con TUTTI i 3 tag (id 2 e id 5) devono essere inclusi
    assert.equal(filtered.length, 2);
    assert.deepEqual(filtered.map((c) => c.id), [2, 5]);
});

test('filterCounselorsByCategories returns empty array when no counselor has all selected tags', () => {
    const list: PublicCounselor[] = [
        { id: 1, slug: 'c1', name: 'Solo filosofo', language: ['it'], approach_categories: ['filosofo'] },
        { id: 2, slug: 'c2', name: 'Solo tutor', language: ['it'], approach_categories: ['tutor'] },
        { id: 3, slug: 'c3', name: 'Docente e psicologo', language: ['it'], approach_categories: ['docente', 'psicologo'] },
    ];

    const selectedTags = ['filosofo', 'tutor'];
    const filtered = filterCounselorsByCategories(list, selectedTags);

    assert.equal(filtered.length, 0);
    assert.deepEqual(filtered, []);
});

test('filterCounselorsByCategories preserves recommended counselor priority at top only if it matches all tags', () => {
    const list: PublicCounselor[] = [
        { id: 10, slug: 'c10', name: 'Tutti i tag Non-rec', language: ['it'], approach_categories: ['filosofo', 'docente', 'tutor'] },
        { id: 20, slug: 'c20', name: 'Tutti i tag Recommended', language: ['it'], approach_categories: ['filosofo', 'docente', 'tutor', 'maieutico'] },
        { id: 30, slug: 'c30', name: 'Tutti i tag Non-rec 2', language: ['it'], approach_categories: ['filosofo', 'docente', 'tutor'] },
    ];

    const selectedTags = ['filosofo', 'docente', 'tutor'];
    // id 20 ha tutti i tag ed e' raccomandato
    const filtered = filterCounselorsByCategories(list, selectedTags, 20);

    assert.equal(filtered.length, 3);
    // Il raccomandato (id 20) deve apparire per primo in cima
    assert.equal(filtered[0].id, 20);
    assert.deepEqual(filtered.map((c) => c.id), [20, 10, 30]);
});

test('filterCounselorsByCategories excludes recommended counselor if it lacks some or all selected tags', () => {
    const list: PublicCounselor[] = [
        { id: 1, slug: 'c1', name: 'Full match', language: ['it'], approach_categories: ['filosofo', 'docente'] },
        { id: 2, slug: 'c2', name: 'Recommended Partial Match', language: ['it'], approach_categories: ['filosofo'] },
        { id: 3, slug: 'c3', name: 'Recommended No Match', language: ['it'], approach_categories: ['psicologo'] },
    ];

    // id 2 e' raccomandato ma possiede solo 1 dei 2 tag selezionati -> escluso
    const filteredPartial = filterCounselorsByCategories(list, ['filosofo', 'docente'], 2);
    assert.equal(filteredPartial.length, 1);
    assert.equal(filteredPartial[0].id, 1);

    // id 3 e' raccomandato ma possiede 0 tag corrispondenti -> escluso
    const filteredZero = filterCounselorsByCategories(list, ['filosofo'], 3);
    assert.equal(filteredZero.length, 2);
    assert.deepEqual(filteredZero.map((c) => c.id), [1, 2]);
});

