import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { NotebookAutosave, type NotebookData } from './notebook-autosave.ts';

const revision = (data: NotebookData, id = 1) => ({ id, data, source: 'manual', created_at: '2026-09-09' });
function storage() {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

test('every keystroke survives an immediate page reload and belongs only to its account', async () => {
    const disk = storage();
    const send = async (p: { data: NotebookData }) => revision(p.data);
    const first = new NotebookAutosave('alice', null, send, disk);
    first.update({ goal: 'Text typed just before leaving' }, 'intake');
    const restored = new NotebookAutosave('alice', null, send, disk);
    assert.equal(restored.data.goal, 'Text typed just before leaving');
    assert.deepEqual(new NotebookAutosave('bob', null, send, disk).data, {});
    assert.equal(await restored.flush(), true);
    await first.flush();
    assert.equal(disk.getItem('cb_notebook_draft_v1:alice'), null);
});

test('a delayed response cannot overwrite newer typing or delete the newer draft', async () => {
    const disk = storage();
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const writes: NotebookData[] = [];
    const queue = new NotebookAutosave('alice', null, async payload => {
        writes.push(payload.data);
        if (writes.length === 1) await wait;
        return revision(payload.data, writes.length);
    }, disk);
    queue.update({ goal: 'First' }, 'manual');
    const saving = queue.flush();
    queue.update({ goal: 'Newest', notes: 'Also keep this' }, 'manual');
    assert.equal(queue.data.goal, 'Newest');
    assert.match(disk.getItem('cb_notebook_draft_v1:alice')!, /Newest/);
    release();
    await saving;
    assert.deepEqual(writes, [{ goal: 'First' }, { goal: 'Newest', notes: 'Also keep this' }]);
    assert.equal(queue.revision?.data.goal, 'Newest');
    assert.equal(queue.data.notes, 'Also keep this');
    assert.equal(queue.status, 'saved');
});

test('a failed request keeps the draft until a successful retry', async () => {
    const disk = storage();
    let online = false;
    const queue = new NotebookAutosave('alice', null, async p => {
        if (!online) throw new Error('offline');
        return revision(p.data);
    }, disk);
    queue.update({ strengths: 'Drawing' }, 'manual');
    assert.equal(await queue.flush(), false);
    assert.equal(queue.status, 'error');
    assert.match(disk.getItem('cb_notebook_draft_v1:alice')!, /Drawing/);
    online = true;
    assert.equal(await queue.flush(), true);
    assert.equal(queue.status, 'saved');
    assert.equal(disk.getItem('cb_notebook_draft_v1:alice'), null);
});

test('debounce saves without a button and unchanged loading never writes', async () => {
    const writes: NotebookData[] = [];
    const queue = new NotebookAutosave('alice', revision({ goal: 'Already saved' }), async p => {
        writes.push(p.data);
        return revision(p.data);
    }, storage());
    await queue.flush();
    assert.equal(writes.length, 0);
    queue.update({ goal: 'A' }, 'manual');
    queue.update({ goal: 'AB' }, 'manual');
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.deepEqual(writes, [{ goal: 'AB' }]);
    queue.reset();
    assert.deepEqual(queue.data, {});
});
