import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('guided and free chat are the only modes: no OpenCode entry point is left', () => {
    const page = read('../app/page.tsx');
    assert.match(page, /<GuidedChatInterface/);
    assert.match(page, /<FreeChatInterface/);
    assert.doesNotMatch(page, /OpenCodeExperience|api\/opencode|opencode-terminal/);
    assert.equal(existsSync(new URL('../components/qsa/OpenCodeExperience.tsx', import.meta.url)), false);
    assert.equal(existsSync(new URL('../app/api/opencode', import.meta.url)), false);
});

test('the free chat talks to the standard stream, without a phase and with the profile as context', () => {
    const source = read('../components/qsa/FreeChatInterface.tsx');
    assert.doesNotMatch(source, /opencode/i);
    assert.match(source, /streamChat\(\{[\s\S]*scores_context: formatScores\(scores\)/);
    assert.doesNotMatch(source, /\bphase:/);
    assert.match(source, /experience: 'free'/);
});

test('the settings card offers both modes without gating the free chat on a subscription', () => {
    const card = read('../components/qsa/ChatSettingsCard.tsx');
    assert.match(card, /onExperienceChange\?\.\('free'\)/);
    assert.doesNotMatch(card, /subscription/);
});
