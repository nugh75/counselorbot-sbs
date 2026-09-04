import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { normalizeRecommendationCatalog } from './recommendations.ts';

test('normalizeRecommendationCatalog keeps valid items and deduplicates slugs', () => {
    const result = normalizeRecommendationCatalog({
        reading: [
            { slug: 'book-1', title: 'Book one' },
            { slug: 'book-1', title: 'Duplicate' },
            { title: 'Missing slug' },
        ],
        strategy: [
            { slug: 'plan-1', name: 'Weekly plan' },
            null,
            'invalid',
        ],
    });

    assert.deepEqual(result.reading, [{ slug: 'book-1', title: 'Book one' }]);
    assert.deepEqual(result.strategy, [{ slug: 'plan-1', name: 'Weekly plan' }]);
});

test('normalizeRecommendationCatalog returns an empty catalog for invalid input', () => {
    assert.deepEqual(normalizeRecommendationCatalog(undefined), { reading: [], strategy: [] });
    assert.deepEqual(normalizeRecommendationCatalog([]), { reading: [], strategy: [] });
});
