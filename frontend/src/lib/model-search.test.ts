import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { modelSearchOptions, validModelId } from './model-search.ts';

test('search matches provider IDs and labels regardless of case or surrounding spaces', () => {
    assert.deepEqual(modelSearchOptions(['vendor/model-a', 'vendor/model-b'], '', '  FLASH ', { 'vendor/model-b': 'Flash model' }).matches, ['vendor/model-b']);
    assert.deepEqual(modelSearchOptions(['vendor/model-a'], '', 'VENDOR/').matches, ['vendor/model-a']);
});

test('filtering excludes the active model from results while preserving its selection', () => {
    const result = modelSearchOptions(['a', 'b', 'b'], 'custom/id', 'b');
    assert.deepEqual(result, { matches: ['b'], total: 3, selectedHidden: true });
    assert.deepEqual(modelSearchOptions(['a'], 'custom/id', 'missing').matches, []);
    assert.deepEqual(modelSearchOptions(['a'], 'custom/id', '').matches, ['custom/id', 'a']);
});

test('manual IDs accept namespaces and tags but reject blanks and internal whitespace', () => {
    for (const id of ['vendor/model:free', 'model:latest', '  vendor/model  ']) assert.ok(validModelId(id));
    for (const id of ['', '  ', 'vendor/ model', 'model\nname', 'model\tname']) assert.equal(validModelId(id), false);
});
