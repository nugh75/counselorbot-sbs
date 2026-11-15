import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// #956: the student area subpages have no boxed Card, hand-made fields or pills.
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const FILES = [
    'app/profilo/page.tsx', 'app/profilo/cambiamenti/page.tsx',
    'components/profile/LearnerProfileCard.tsx', 'components/profile/TeacherNotesCard.tsx',
    'components/profile/PortfolioCard.tsx', 'components/profile/OrientationDirectoryCard.tsx',
    'components/profile/ActiveActionsCard.tsx', 'components/profile/CrossSynthesisCard.tsx',
    'components/profile/MyGroupsCard.tsx', 'components/profile/MeetingDetails.tsx',
    'components/profile/TelegramLinkCard.tsx', 'components/profile/ChatGPTConnectionPanel.tsx',
    'components/profile/PersonalAPISettings.tsx', 'components/home/InstrumentCatalog.tsx',
    'components/tavolo/TavoloList.tsx',
];

test('student subpages: no boxed Card, no outline-none, no hand pills or dashed boxes', () => {
    for (const file of FILES) {
        const source = read(file);
        assert.doesNotMatch(source, /<Card(?![^>]*variant="flat")[^>]*>/, `${file}: boxed Card`);
        assert.doesNotMatch(source, /(?<![:\w-])outline-none/, `${file}: outline-none`);
        assert.doesNotMatch(source, /rounded-full[^"'`]*px-\d/, `${file}: hand pill`);
        assert.doesNotMatch(source, /border-dashed/, `${file}: dashed box`);
        assert.doesNotMatch(source, /<(select|textarea)\b/, `${file}: hand field`);
        assert.doesNotMatch(source, /<input(?![^>]*type="(checkbox|file)")/, `${file}: hand input`);
    }
});

test('portfolio lightbox is a Dialog, the upcoming tools an EntrySection', () => {
    const portfolio = read('components/profile/PortfolioCard.tsx');
    assert.match(portfolio, /<Dialog\b/);
    assert.doesNotMatch(portfolio, /createPortal|bg-slate-/);
    assert.match(read('components/home/InstrumentCatalog.tsx'), /<EntrySection id="home-upcoming-title"/);
});
