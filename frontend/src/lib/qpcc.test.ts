import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONNAIRES, factorTranslationKey, isReusableProfile } from './questionnaires.ts';
import { FACTOR_DICTS } from './i18n-factors.ts';
import factors from './qpcc-schema.json' with { type: 'json' };

const codes = ['A1','A2','A3','V1','V2','C1','C2','M1','M2','M3'];

test('QPCC exposes exactly ten factors in four dimensions and preserves QSA and narrative tools', () => {
    assert.deepEqual(QUESTIONNAIRES.QPCC.factors.map(f => f.code), codes);
    assert.deepEqual(QUESTIONNAIRES.QPCC.factorPrefix, ['A','V','C','M']);
    assert.deepEqual(QUESTIONNAIRES.QPCC.invertedFactors, ['A1','A2','A3']);
    assert.equal(QUESTIONNAIRES.QSA.factors[1].name, 'Autoregolazione');
    for (const id of ['SAVICKAS','IDEA','EVENTO_STUDIO','EVENTO_PROFESSIONALE','OBIETTIVO_STUDIO','OBIETTIVO_DOCENZA']) {
        assert.deepEqual(QUESTIONNAIRES[id].invertedFactors, []);
    }
    const ego = QUESTIONNAIRES.QPCC.factors.find(f => f.code === 'M2')!;
    assert.equal(ego.lowLabel,ego.highLabel);
});

test('all six languages scope overlapping codes to QPCC without replacing QSA names', () => {
    for (const [lang, dictionary] of Object.entries(FACTOR_DICTS)) {
        for (const factor of factors) {
            assert.equal(dictionary[factorTranslationKey('QPCC',factor.code)],factor.labels[lang as keyof typeof factor.labels]);
            assert.ok(dictionary[`dimension.QPCC.${factor.dimension}`]);
        }
        assert.notEqual(dictionary['factor.A2.name'],dictionary['factor.QPCC.A2.name']);
        assert.notEqual(dictionary['factor.C2.name'],dictionary['factor.QPCC.C2.name']);
    }
    assert.equal(factorTranslationKey('QSA','A2'),'factor.A2.name');
});

test('only complete canonical stanines can be resumed as QPCC', () => {
    const valid = Object.fromEntries(codes.map(code => [code,5]));
    assert.ok(isReusableProfile('QPCC',valid));
    const invalid: Array<Record<string, number> | null> = [null, {}, {K1:5,K2:6,K3:4,K4:7,K5:5}, {...valid,M2:2.5}, {...valid,A3:10}, {...valid,K1:5}];
    for (const value of invalid) {
        assert.equal(isReusableProfile('QPCC',value),false);
    }
    assert.ok(isReusableProfile('QSA',{C1:7}));
});
