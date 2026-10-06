import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// @ts-expect-error -- Node direct typescript execution requires extension
import { getCounselorTagline, type PublicCounselor } from './counselor.ts';
// @ts-expect-error -- Node direct typescript execution requires extension
import { formatCategoryLabel, CATEGORY_LABELS } from './i18n-counselor-identity.ts';

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
            es: 'Te acompaña con preguntas que ayudan a aclarar ideas.',
        },
        approach_categories: ['filosofo', 'maieutico'],
        approach_summary: 'Sommario approccio maieutico',
        description: 'Descrizione classica',
    };

    // Lingua richiesta presente
    assert.equal(getCounselorTagline(counselor, 'it'), 'Ti accompagna con domande calme e precise.');
    assert.equal(getCounselorTagline(counselor, 'en'), 'Accompanies you with calm, precise questions.');
    assert.equal(getCounselorTagline(counselor, 'es'), 'Te acompaña con preguntas que ayudan a aclarar ideas.');

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

    // 3. Filtro per categorie di approccio (chip)
    assert.match(src, /t\('counselor\.filter\.label'\)/);
    assert.match(src, /t\('counselor\.filter\.all'\)/);
    assert.match(src, /selectedCategory/);
    assert.match(src, /formatCategoryLabel/);

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
