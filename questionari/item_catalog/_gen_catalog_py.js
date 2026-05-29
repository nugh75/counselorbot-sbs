// One-off generator: estrae item + regole di scala dai sorgenti TS attuali
// (frontend/src/lib/test-administrations.ts e test-scoring.ts) e produce
// backend/questionnaire_catalog.py come fonte del seed DB-driven.
// Uso: node questionari/item_catalog/_gen_catalog_py.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const adminTs = fs.readFileSync(path.join(ROOT, 'frontend/src/lib/test-administrations.ts'), 'utf8');
const scoringTs = fs.readFileSync(path.join(ROOT, 'frontend/src/lib/test-scoring.ts'), 'utf8');

// Estrae il valore di `const NAME ... = <literal>;` come oggetto JS via eval.
function extractConst(src, name) {
    const re = new RegExp('const\\s+' + name + '\\b[^=]*=\\s*(\\[[\\s\\S]*?\\n\\]);', 'm');
    const m = src.match(re);
    if (!m) throw new Error('Non trovato: ' + name);
    // eslint-disable-next-line no-eval
    return eval(m[1]);
}

const instruments = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'];
const itemVar = { QSA: 'QSA', QSAr: 'QSAR', ZTPI: 'ZTPI', QPCS: 'QPCS', QPCC: 'QPCC', QAP: 'QAP' };
const factorVar = { QSA: 'QSA_FACTORS', QSAr: 'QSAR_FACTORS', ZTPI: 'ZTPI_FACTORS', QPCS: 'QPCS_FACTORS', QPCC: 'QPCC_FACTORS', QAP: 'QAP_FACTORS' };

// Nomi + scala risposta da test-administrations.ts
const INSTRUMENT_NAMES = extractConstObj(adminTs, 'INSTRUMENT_NAMES');
function extractConstObj(src, name) {
    const re = new RegExp('const\\s+' + name + '\\b[^=]*=\\s*(\\{[\\s\\S]*?\\n\\});', 'm');
    const m = src.match(re);
    if (!m) throw new Error('Non trovato obj: ' + name);
    // eslint-disable-next-line no-eval
    return eval('(' + m[1] + ')');
}
// export const INSTRUMENT_NAMES — gestisci la keyword export
function extractExportObj(src, name) {
    const re = new RegExp('export const\\s+' + name + '\\b[^=]*=\\s*(\\{[\\s\\S]*?\\n\\});', 'm');
    const m = src.match(re);
    if (!m) throw new Error('Non trovato export obj: ' + name);
    return eval('(' + m[1] + ')');
}
const NAMES = extractExportObj(adminTs, 'INSTRUMENT_NAMES');

// Scala risposta: EN_BASE.scale è 1-4 generico; QPCC ha override. Determiniamo min/max.
// Tutti gli strumenti attuali usano 1..4 (scale array di 4 label).
function scaleFor(code) {
    // QPCC ha label di accordo, gli altri di frequenza: comunque 4 punti -> 1..4
    return { min: 1, max: 4 };
}

const out = [];
out.push('"""Catalogo strumenti di default per il seed DB-driven (generato da _gen_catalog_py.js).');
out.push('');
out.push('Fonte: stato attuale di frontend/src/lib/test-administrations.ts e test-scoring.ts.');
out.push('NON modificare a mano: dopo il primo seed le modifiche avvengono via editor admin (DB).');
out.push('Vedi questionari/PROGETTO_VALIDAZIONE_E_SVILUPPO_QSA_QSAR_SV_EN.md.');
out.push('"""');
out.push('');
out.push('INSTRUMENT_CATALOG_DEFAULTS = {');

for (const code of instruments) {
    const items_en = extractConst(adminTs, itemVar[code] + '_EN');
    const items_sv = extractConst(adminTs, itemVar[code] + '_SV');
    const factors = extractConst(scoringTs, factorVar[code]);
    const scale = scaleFor(code);

    // Mappa item_number -> {factor_code, reverse}
    const itemMap = {};
    for (const f of factors) {
        const rev = new Set(f.reverseItems || []);
        for (const n of f.itemNumbers) {
            itemMap[n] = { factor_code: f.code, reverse: rev.has(n) };
        }
    }

    out.push('    ' + py(code) + ': {');
    out.push('        "name_en": ' + py(NAMES[code].en) + ',');
    out.push('        "name_sv": ' + py(NAMES[code].sv) + ',');
    out.push('        "response_scale_min": ' + scale.min + ',');
    out.push('        "response_scale_max": ' + scale.max + ',');
    out.push('        "report_scale_type": "stanine",');
    out.push('        "factors": [');
    for (const f of factors) {
        out.push('            {"code": ' + py(f.code) + ', "dimension": ' + py(f.dimension) +
            ', "orientation": ' + py(f.orientation) +
            ', "label_en": ' + py(f.labels.en) + ', "label_sv": ' + py(f.labels.sv) + '},');
    }
    out.push('        ],');
    out.push('        "items": [');
    const n = items_en.length;
    for (let i = 0; i < n; i++) {
        const num = i + 1;
        const info = itemMap[num] || { factor_code: null, reverse: false };
        out.push('            {"item_number": ' + num +
            ', "factor_code": ' + py(info.factor_code) +
            ', "reverse_scoring": ' + (info.reverse ? 'True' : 'False') +
            ', "text_en": ' + py(items_en[i]) +
            ', "text_sv": ' + py(items_sv[i]) + '},');
    }
    out.push('        ],');
    out.push('    },');
}
out.push('}');
out.push('');

function py(v) {
    if (v === null || v === undefined) return 'None';
    return JSON.stringify(v);
}

fs.writeFileSync(path.join(ROOT, 'backend/questionnaire_catalog.py'), out.join('\n'));
console.log('Scritto backend/questionnaire_catalog.py');
for (const code of instruments) {
    const en = extractConst(adminTs, itemVar[code] + '_EN');
    console.log('  ' + code + ': ' + en.length + ' item');
}
