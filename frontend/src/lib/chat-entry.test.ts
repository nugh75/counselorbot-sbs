import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('every tool opens the standard guided chat: no OpenCode entry point is left', () => {
    const page = read('../app/page.tsx');
    assert.match(page, /<GuidedChatInterface/);
    assert.doesNotMatch(page, /opencode|OpenCodeExperience/i);
    assert.doesNotMatch(read('../components/qsa/ChatSettingsCard.tsx'), /opencode|onExperienceChange/i);
    assert.equal(existsSync(new URL('../components/qsa/OpenCodeExperience.tsx', import.meta.url)), false);
    assert.equal(existsSync(new URL('../app/api/opencode', import.meta.url)), false);
});
