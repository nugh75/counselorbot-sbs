import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { linkedSegments, normalizeRecommendationCatalog, provenanceKind, recommendationPatchUrl, safeHttpUrl } from './recommendations.ts';

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

    assert.deepEqual(result.reading, [{ slug: 'book-1', title: 'Book one', status: 'proposed', helpful: null }]);
    assert.deepEqual(result.strategy, [{ slug: 'plan-1', name: 'Weekly plan', status: 'proposed', helpful: null }]);
});

test('normalizeRecommendationCatalog returns an empty catalog for invalid input', () => {
    assert.deepEqual(normalizeRecommendationCatalog(undefined), { reading: [], strategy: [] });
    assert.deepEqual(normalizeRecommendationCatalog([]), { reading: [], strategy: [] });
});

test('a choice already made survives a reload, an unknown one falls back to proposed', () => {
    const result = normalizeRecommendationCatalog({
        reading: [
            { slug: 'kept', status: 'tried', helpful: true },
            { slug: 'unknown-state', status: 'archiviata' },
        ],
        strategy: [{ slug: 'dismissed-one', status: 'dismissed', helpful: 'yes' }],
    });

    assert.equal(result.reading[0].status, 'tried');
    assert.equal(result.reading[0].helpful, true);
    assert.equal(result.reading[1].status, 'proposed');
    // Archiviata resta archiviata: il pannello la recupera da li'.
    assert.equal(result.strategy[0].status, 'dismissed');
    assert.equal(result.strategy[0].helpful, null);
});

test('the metadata the panel needs is not dropped on the way in', () => {
    const result = normalizeRecommendationCatalog({
        reading: [{ slug: 'book-1', turn_index: 3, matched_on: ['ansia-e-prestazione'], where: 'Biblioteca' }],
        strategy: [],
    });

    assert.equal(result.reading[0].turn_index, 3);
    assert.deepEqual(result.reading[0].matched_on, ['ansia-e-prestazione']);
    assert.equal(result.reading[0].where, 'Biblioteca');
});

test('only http(s) becomes a link', () => {
    assert.equal(safeHttpUrl('https://example.org/libro'), 'https://example.org/libro');
    assert.equal(safeHttpUrl('javascript:alert(1)'), null);
    assert.equal(safeHttpUrl('data:text/html,<script>'), null);
    assert.equal(safeHttpUrl('mailto:biblioteca@example.org'), null);
    assert.equal(safeHttpUrl('biblioteca comunale'), null);
    assert.equal(safeHttpUrl(''), null);
    assert.equal(safeHttpUrl(undefined), null);
});

test('the address is normalized and the sentence keeps its punctuation', () => {
    assert.equal(safeHttpUrl('HTTPS://Example.ORG'), 'https://example.org/');
    assert.equal(safeHttpUrl('https://example.org/libro.'), 'https://example.org/libro');
    assert.equal(safeHttpUrl('https://example.org/libro),'), 'https://example.org/libro');
    // Le parentesi aperte dentro l'indirizzo restano: sono parte del titolo.
    assert.equal(safeHttpUrl('https://it.wikipedia.org/wiki/Ansia_(psicologia)'), 'https://it.wikipedia.org/wiki/Ansia_(psicologia)');
});

test('prose around a link stays prose and nothing is lost', () => {
    const text = 'In prestito in biblioteca, oppure su https://example.org/libro. Chiedi al bancone.';
    const segments = linkedSegments(text);
    const linked = segments.filter((segment) => segment.href);

    assert.equal(linked.length, 1);
    assert.equal(linked[0].href, 'https://example.org/libro');
    assert.equal(linked[0].text, 'https://example.org/libro');
    assert.equal(segments.map((segment) => segment.text).join(''), text);
});

test('a text without addresses is a single unlinked segment', () => {
    const segments = linkedSegments('Disponibile nella biblioteca della scuola');
    assert.equal(segments.length, 1);
    assert.equal(segments[0].href, undefined);
    assert.deepEqual(linkedSegments(''), []);
});

test('provenance says what kind of link it was, never the raw marker', () => {
    assert.equal(provenanceKind({ matched_on: ['ansia-e-prestazione', 'emozioni'] }), 'themes');
    assert.equal(provenanceKind({ matched_on: ['C2', 'T4'] }), 'scores');
    assert.equal(provenanceKind({ matched_on: ['scope:SAVICKAS'] }), 'scope');
    assert.equal(provenanceKind({ matched_on: [] }), null);
    assert.equal(provenanceKind({}), null);
});

test('the patch address survives a slug with characters to escape', () => {
    assert.equal(
        recommendationPatchUrl('sess/1', 'reading', 'a b/c'),
        '/api/session/sess%2F1/recommendations/reading/a%20b%2Fc',
    );
});
