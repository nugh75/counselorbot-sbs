import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const questionnaireSelector = () =>
    readFileSync(new URL('../components/questionnaire/QuestionnaireSelector.tsx', import.meta.url), 'utf8');
const counselorSelector = () =>
    readFileSync(new URL('../components/questionnaire/CounselorSelector.tsx', import.meta.url), 'utf8');
const inputMethodSelector = () =>
    readFileSync(new URL('../components/qsa/InputMethodSelector.tsx', import.meta.url), 'utf8');
const introScreen = () =>
    readFileSync(new URL('../components/home/IntroScreen.tsx', import.meta.url), 'utf8');

test('QuestionnaireSelector supports both single-click selection and double-click immediate advance', () => {
    const src = questionnaireSelector();
    // Card questionario
    assert.match(src, /onClick=\{\(\) => setSelectedKey\(q\.id\)\}/);
    assert.match(src, /onDoubleClick=\{\(\) => \{\s*setSelectedKey\(q\.id\);\s*onSelect\(q\);\s*\}\}/);

    // Card pQBL
    assert.match(src, /onClick=\{\(\) => setSelectedKey\('pqbl'\)\}/);
    assert.match(src, /onDoubleClick=\{\(\) => \{\s*setSelectedKey\('pqbl'\);\s*router\.push\('\/pqbl'\);\s*\}\}/);
});

test('CounselorSelector supports both single-click selection and double-click immediate advance', () => {
    const src = counselorSelector();
    assert.match(src, /onClick=\{\(\) => choose\(c\)\}/);
    assert.match(src, /onDoubleClick=\{\(\) => \{\s*if \(disabled \|\| busy\) return;\s*choose\(c\);\s*if \(onContinue\) onContinue\(c\.id\);\s*\}\}/);
});

test('InputMethodSelector supports both single-click selection and double-click immediate advance', () => {
    const src = inputMethodSelector();
    // Metodi standard (manual, upload)
    assert.match(src, /onClick=\{\(\) => setSelected\(opt\.key\)\}/);
    assert.match(src, /onDoubleClick=\{\(\) => \{\s*setSelected\(opt\.key\);\s*onSelect\(opt\.key\);\s*\}\}/);

    // Metodo resume (con salvataggi)
    assert.match(src, /onDoubleClick=\{\(\) => \{\s*setSelected\(opt\.key\);\s*if \(chosenResultId !== null\) \{/);
});

test('IntroScreen action cards support both single-click selection and double-click advance without buttons', () => {
    const src = introScreen();
    assert.doesNotMatch(src, /<Button/);
    assert.match(src, /onClick=\{\(\) => setSelectedAction\(action\.key\)\}/);
    assert.match(src, /onDoubleClick=\{\(\) => \{\s*setSelectedAction\(action\.key\);\s*action\.onAdvance\?\.\(\);\s*\}\}/);
    assert.match(src, /images\/intro\/compass\.png/);
    assert.match(src, /images\/intro\/tools\.png/);
});
