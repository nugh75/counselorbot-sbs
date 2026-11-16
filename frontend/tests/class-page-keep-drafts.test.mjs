import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const hook = read('components/teacher/useTeacherResource.ts');
const page = read('components/teacher/ClassSettingsPage.tsx');
const detail = page.slice(page.indexOf('function ClassDetail('), page.indexOf('export function ClassSettingsPage('));

test('reload of a loaded path refreshes in the background instead of flipping loading', () => {
    assert.match(hook, /if \(loadedPath\.current === path\) setRefreshing\(true\); else setLoading\(true\);/);
    assert.match(hook, /setData\(parse\(payload\)\); loadedPath\.current = path;/);
    assert.match(hook, /setLoading\(false\);\s*setRefreshing\(false\);/);
    assert.match(hook, /return \{ data, loading, refreshing, failed, forbidden, reload \};/);
    // A forbidden response clears the data, so the next read is a first load again.
    assert.equal([...hook.matchAll(/setData\(undefined\);\s*loadedPath\.current = undefined;/g)].length, 2);
});

test('class page keeps typed drafts mounted across data reloads', () => {
    // Spinner only on first load (the hook keeps `loading` false on later reloads).
    assert.match(detail, /if \(groups\.loading \|\| settings\.loading\) return <TeacherLoading \/>;/);
    // A failed background refresh shows the error above the tabs, without unmounting them.
    assert.doesNotMatch(detail, /if \([^)]*\.failed[^)]*\) return/);
    assert.match(detail, /\{\(groups\.failed \|\| settings\.failed\) && loadError\}/);
    // The tools editor resets only when the settings revision really changes.
    assert.match(detail, /<ClassToolsEditor key=\{settings\.data\.revision\}/);
    // Forum and plans stay mounted, so their drafts survive tab switches and reloads.
    assert.match(detail, /hidden=\{tab !== 'paths'\} tabIndex=\{0\}>\s*<ClassPathsTab /);
    assert.match(detail, /hidden=\{tab !== 'forum'\} tabIndex=\{0\}>\s*<ForumView /);
});

test('active class tab lives in the URL and falls back to Overview', () => {
    assert.match(detail, /new URLSearchParams\(window\.location\.search\)\.get\('tab'\)/);
    assert.match(detail, /\?\? 'overview'/);
    assert.match(detail, /if \(next === 'overview'\) url\.searchParams\.delete\('tab'\); else url\.searchParams\.set\('tab', next\);/);
    assert.match(detail, /window\.history\.replaceState\(window\.history\.state, '', url\)/);
    // Every tab change goes through selectTab, so the URL never drifts from the UI.
    assert.equal([...detail.matchAll(/\bsetTab\(/g)].length, 1);
    assert.match(detail, /onClick=\{\(\) => selectTab\(key\)\}/);
    assert.match(detail, /selectTab\(activeTabs\[next\]\)/);
    assert.match(detail, /onSelectTab=\{\(newTab\) => selectTab\(newTab\)\}/);
    // Every tab written to the URL is read back by the initial parser.
    for (const key of ['students', 'paths', 'forum', 'audit', 'toolsTab', 'council', 'orientation', 'noticing']) {
        assert.match(detail, new RegExp(`\\b${key}: '${key}'`), key);
    }
});
