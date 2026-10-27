import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { resumeHref } from './resume-href.ts';

test('plan sessions resume through their step and unsafe destinations fall back to the exact session', () => {
    for (const suffix of ['', '/approfondimento']) {
        const resume_href = `/profilo/piani-operativi/12/34${suffix}?resume=1`;
        assert.equal(resumeHref({ session_id: 'saved', resume_href }), resume_href);
    }
    for (const resume_href of [undefined, '//elsewhere.test', '/login', 'https://elsewhere.test', '/profilo/piani-operativi/12/34?resume=1&redirect=bad'])
        assert.equal(resumeHref({ session_id: 'saved / value', resume_href }), '/?frozen=saved%20%2F%20value');
});
