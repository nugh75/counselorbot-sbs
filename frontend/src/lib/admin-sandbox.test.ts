import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { PROMPT_MAP_DICTS } from './i18n-prompt-map.ts';
import type { Lang } from './i18n.ts';

const REQUIRED_SANDBOX_KEYS = [
    'admin.promptMap.testChat',
    'admin.q.testChat',
    'admin.sandbox.title',
    'admin.sandbox.badge',
    'admin.sandbox.disclaimer',
    'admin.sandbox.restart',
    'admin.sandbox.close',
    'admin.sandbox.openFullscreen',
    'admin.sandbox.backToAdmin',
    'admin.sandbox.selectCounselor',
    'admin.sandbox.notSuitable',
    'admin.sandbox.draftBadge',
    'admin.sandbox.activeBadge',
    'admin.sandbox.noSteps',
    'admin.sandbox.loading',
    'admin.sandbox.completedTitle',
    'admin.sandbox.completedBody',
] as const;

const SUPPORTED_LOCALES: Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];

test('admin sandbox i18n keys exist and are non-empty across all 6 languages', () => {
    for (const lang of SUPPORTED_LOCALES) {
        const dict = PROMPT_MAP_DICTS[lang];
        assert.ok(dict, `Dictionary for ${lang} must exist`);
        for (const key of REQUIRED_SANDBOX_KEYS) {
            const val = dict[key];
            assert.ok(
                typeof val === 'string' && val.trim().length > 0,
                `Language ${lang} must define non-empty key ${key}`
            );
        }
    }
});

test('sandbox sessionId generator follows prefix convention and isolates test runs', () => {
    function generateSandboxSessionId(code: string): string {
        const cleanCode = (code || 'instrument').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const rand = Math.random().toString(36).slice(2, 7);
        return `sandbox-${cleanCode}-${Date.now()}-${rand}`;
    }

    const sid1 = generateSandboxSessionId('ORIENTA_TEST');
    const sid2 = generateSandboxSessionId('ORIENTA_TEST');

    assert.ok(sid1.startsWith('sandbox-orienta_test-'));
    assert.ok(sid2.startsWith('sandbox-orienta_test-'));
    assert.notEqual(sid1, sid2, 'Each sandbox session must have a unique ephemeral id');
});

test('preview payload flag is explicitly forwarded for sandbox testing', () => {
    function buildChatPayload(options: {
        message: string;
        counselorId: number | null;
        questionnaireType: string;
        sessionId: string;
        preview?: boolean;
    }) {
        return {
            message: options.message,
            counselor_id: options.counselorId,
            questionnaire_type: options.questionnaireType,
            session_id: options.sessionId,
            ...(options.preview ? { preview: true } : {}),
        };
    }

    const standardPayload = buildChatPayload({
        message: 'Ciao',
        counselorId: 1,
        questionnaireType: 'ORIENTA_TEST',
        sessionId: 'regular-session-123',
    });
    assert.equal(standardPayload.preview, undefined);

    const sandboxPayload = buildChatPayload({
        message: 'Ciao',
        counselorId: 1,
        questionnaireType: 'ORIENTA_TEST',
        sessionId: 'sandbox-orienta_test-123',
        preview: true,
    });
    assert.equal(sandboxPayload.preview, true);
});
