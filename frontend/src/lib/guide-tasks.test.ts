import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { guideTaskCopy, guideTaskTexts } from './i18n-guide-tasks.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { GUIDE_GROUPS, GUIDE_TASKS, guideTaskHref, legacyGuideTask, searchGuideTasks, visibleGuideTasks } from './guide-tasks.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { pathActivityText } from './i18n-path-activity.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { classPathText } from './i18n-class-paths.ts';
const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const disabled = {personalAPI: false, chatgpt: false};

test('every task has three concise instructions and a real translation in six languages', () => {
    assert.equal(new Set(GUIDE_TASKS.map(task => task.id)).size, GUIDE_TASKS.length);
    assert.equal(Object.keys(guideTaskTexts).length, GUIDE_TASKS.length);
    for (const task of GUIDE_TASKS) for (const lang of languages) {
        const copy = guideTaskCopy(lang, task.id);
        assert.equal(guideTaskTexts[task.id][languages.indexOf(lang)].split('|').length, 6, `${task.id}/${lang}`);
        assert.ok([copy.title, copy.intro, ...copy.steps, copy.note].every(value => value.length > 8), `${task.id}/${lang}`);
        assert.ok([copy.title, copy.intro, ...copy.steps, copy.note].join(' ').split(/\s+/).length <= 115, `${task.id}/${lang} too long`);
        if (lang !== 'en') assert.notEqual(copy.steps.join(' '), guideTaskCopy('en', task.id).steps.join(' '));
        assert.ok(task.href.startsWith('/') && !task.href.startsWith('//'));
        assert.ok(task.related?.every(id => GUIDE_TASKS.some(item => item.id === id)) ?? true);
    }
});
test('six student and teacher groups keep administrative and optional setup out of ordinary instructions', () => {
    for (const audience of ['student', 'teacher'] as const) {
        const tasks = visibleGuideTasks(audience, disabled);
        assert.deepEqual(new Set(tasks.map(task => task.group)), new Set(GUIDE_GROUPS));
        assert.ok(!tasks.some(task => task.id === 'admin-classes' || task.feature));
        const words = tasks.flatMap(task => {const c = guideTaskCopy('it', task.id); return [c.title,c.intro,...c.steps,c.note];}).join(' ').split(/\s+/).length;
        assert.ok(words < (audience === 'student' ? 1600 : 1300), `${audience}: ${words} words`);
    }
    assert.deepEqual(visibleGuideTasks('admin', disabled).map(task => task.id), ['admin-classes', 'external-privacy']);
    assert.ok(visibleGuideTasks('teacher', {personalAPI: true, chatgpt: false}).some(task => task.id === 'personal-api'));
    assert.ok(!visibleGuideTasks('teacher', {personalAPI: true, chatgpt: false}).some(task => task.id === 'chatgpt'));
});
test('search understands action words, accents and multiple terms without crossing audiences', () => {
    const tasks = visibleGuideTasks('student', disabled);
    assert.deepEqual(searchGuideTasks(tasks, 'RIFAI', 'it').map(task => task.id), ['repeat']);
    assert.ok(searchGuideTasks(tasks, 'CONVERSACION', 'es').some(task => task.id === 'chat'));
    assert.ok(searchGuideTasks(tasks, 'piano riprendi', 'it').some(task => task.id === 'resume'));
    assert.deepEqual(searchGuideTasks(tasks, 'xxxxxxxxxxxxxxxx', 'it'), []);
    assert.deepEqual(searchGuideTasks(tasks, '   ', 'it'), tasks);
    assert.ok(!searchGuideTasks(tasks, 'pubblicare', 'it').some(task => task.id === 'build-plan'));
});
test('all existing numbered bookmarks and control links resolve to a current task', () => {
    for (let i = 1; i <= 17; i++) assert.ok(legacyGuideTask(`#guide-section-${i}`));
    for (let i = 1; i <= 9; i++) assert.ok(legacyGuideTask(`#guide-teacher-section-${i}`));
    assert.equal(legacyGuideTask('#guide-chat-controls'), 'chat');
    assert.equal(legacyGuideTask('#guide-admin-class-settings'), 'admin-classes');
    assert.equal(legacyGuideTask('#guide-teacher-section-9'), 'build-plan');
    assert.equal(legacyGuideTask('#guide-teacher-section-6'), 'sharing');
    assert.equal(legacyGuideTask('#guide-teacher-section-7'), 'orientation');
    assert.equal(legacyGuideTask('#guide-section-17'), 'resume');
    assert.equal(legacyGuideTask('#guide-section-900'), null);
    assert.equal(legacyGuideTask('#unknown'), null);
    assert.equal(guideTaskHref('resume'), '/guide?audience=student&task=resume');
});
test('plan instructions quote the actual action labels in every language', () => {
    for (const lang of languages) {
        const resume = guideTaskCopy(lang, 'resume').steps.join(' ');
        const repeat = guideTaskCopy(lang, 'repeat').steps.join(' ');
        assert.ok(resume.includes(classPathText(lang,'pathsTitle')), `${lang}/plan title`);
        for (const key of ['start','resume','saveExit']) assert.ok(resume.includes(pathActivityText(lang,key)), `${lang}/${key}`);
        for (const key of ['anotherAttempt','newCompilation','review']) assert.ok(repeat.includes(pathActivityText(lang,key)), `${lang}/${key}`);
    }
});
