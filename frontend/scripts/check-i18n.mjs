import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(frontendRoot, 'src');
const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const i18nModules = ['i18n.ts', 'i18n-admin.ts', 'i18n-factors.ts', 'i18n-survey.ts', 'i18n-readings.ts', 'i18n-orientation.ts'];
const modules = new Map();

function sourceFile(file, kind = ts.ScriptKind.TS) {
    return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
}

for (const name of i18nModules) {
    const file = path.join(sourceRoot, 'lib', name);
    const source = sourceFile(file);
    const declarations = new Map();
    const visit = (node) => {
        if (
            ts.isVariableDeclaration(node)
            && ts.isIdentifier(node.name)
            && node.initializer
            && ts.isObjectLiteralExpression(node.initializer)
        ) {
            declarations.set(node.name.text, node.initializer);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    modules.set(name, { source, declarations });
}

function propertyName(node) {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isIdentifier(node)
        ? node.text
        : null;
}

function literalValue(node) {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function objectValues(moduleName, declarationName, seen = new Set()) {
    if (/^readings(It|En|Es|Fr|De|Sv)$/.test(declarationName)) moduleName = 'i18n-readings.ts';
    const token = `${moduleName}:${declarationName}`;
    if (seen.has(token)) return new Map();
    seen.add(token);
    const object = modules.get(moduleName)?.declarations.get(declarationName);
    const values = new Map();
    if (!object) return values;

    for (const property of object.properties) {
        if (ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression)) {
            for (const [key, value] of objectValues(moduleName, property.expression.text, seen)) {
                values.set(key, value);
            }
        } else if (ts.isPropertyAssignment(property)) {
            const key = propertyName(property.name);
            const value = literalValue(property.initializer);
            if (key && value !== null) values.set(key, value);
        }
    }
    return values;
}

function containerValues(moduleName, declarationName, language) {
    const { declarations } = modules.get(moduleName);
    const container = declarations.get(declarationName);
    const property = container?.properties.find(
        (candidate) => ts.isPropertyAssignment(candidate) && propertyName(candidate.name) === language,
    );
    const values = new Map();
    if (!property || !ts.isObjectLiteralExpression(property.initializer)) return values;
    for (const spread of property.initializer.properties) {
        if (ts.isSpreadAssignment(spread) && ts.isIdentifier(spread.expression)) {
            for (const [key, value] of objectValues(moduleName, spread.expression.text)) values.set(key, value);
        }
    }
    return values;
}

const dictionaries = Object.fromEntries(languages.map((language) => [
    language,
    new Map([
        ...objectValues('i18n.ts', language),
        ...containerValues('i18n-admin.ts', 'ADMIN_DICTS', language),
        ...objectValues('i18n-factors.ts', language),
        ...objectValues('i18n-survey.ts', language),
        ...containerValues('i18n-orientation.ts', 'ORIENTATION_DICTS', language),
    ]),
]));
const allKeys = new Set(languages.flatMap((language) => [...dictionaries[language].keys()]));
const errors = [];

for (const language of languages) {
    const missing = [...allKeys].filter((key) => !dictionaries[language].has(key));
    if (missing.length) errors.push(`${language}: missing dictionary keys: ${missing.join(', ')}`);
}

const questionnaireSource = fs.readFileSync(path.join(sourceRoot, 'lib', 'questionnaires.ts'), 'utf8');
const factorCodes = new Set(
    [...questionnaireSource.matchAll(/\{\s*code:\s*['"]([^'"]+)['"],\s*name:/g)].map((match) => match[1]),
);
for (const language of languages) {
    for (const code of factorCodes) {
        for (const suffix of ['name', 'desc']) {
            const key = `factor.${code}.${suffix}`;
            if (!dictionaries[language].has(key)) errors.push(`${language}: missing factor translation: ${key}`);
        }
    }
}

const configFormSource = fs.readFileSync(path.join(sourceRoot, 'components', 'admin', 'ConfigForm.tsx'), 'utf8');
const localizedConfigKeys = new Set(
    [...configFormSource.matchAll(/\{\s*key:\s*['"]((?:prompt_|text_|label_)[^'"]+)['"],\s*label:/g)]
        .map((match) => `admin.config.label.${match[1]}`),
);
for (const language of languages) {
    for (const key of localizedConfigKeys) {
        if (!dictionaries[language].has(key)) errors.push(`${language}: missing config-field translation: ${key}`);
    }
}

const identicalEnglishAllowlist = new Set([
    'admin.aq.topic.cb_counselor',
    'q.ZTPI.fullName',
    'profile.savickasTitle',
]);
for (const language of ['es', 'fr', 'de', 'sv']) {
    for (const [key, english] of dictionaries.en) {
        const translated = dictionaries[language].get(key);
        if (
            translated === english
            && english.length >= 24
            && /[A-Za-z]{3}/.test(english)
            && !identicalEnglishAllowlist.has(key)
        ) {
            errors.push(`${language}: long value still matches English: ${key}`);
        }
    }
}

const allowedVisibleText = new Set([
    'CounselorBot', 'CounselorBot ·', 'CounselorBot AI', 'competenzestrategiche.it',
    'Daniele Dragoni', 'daniele.dragoni@uniroma3.it', 'ID:', 'PDF', '/link', 'QR',
    'CSV', 'JSON', 'EUR', 'ENV', 'Email / Tel / CF', 'study=CODICE', 'text_es',
    'counselor', 'it', 'en', 'err', 'q', ': ollama /',
]);
const allowedVisibleAttributes = new Set([
    'QSA, QSAr', 'C2 pianificazione obiettivo', 'Carol S. Dweck', 'A1, S1',
    'concentrazione distrazione', 'es. normativa-scuola', 'es. Normativa scolastica',
    'marco', 'deepseek-v4-flash', 'auto', 'qsa-planning-next-step', 'dweck-mindset',
    'focus-c6', 'QR', 'https://...', 'https://',
]);
const localeSpecificFiles = new Set([
    'components/administration/QuestionnaireRunner.tsx',
]);
const visibleAttributes = new Set(['placeholder', 'title', 'aria-label', 'alt']);

function sourceFiles(directory) {
    return fs.readdirSync(directory, { recursive: true })
        .filter((relative) => /\.(ts|tsx)$/.test(relative))
        .map((relative) => path.join(directory, relative));
}

function lineOf(source, node) {
    return source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function normalized(text) {
    return text.replace(/\s+/g, ' ').trim();
}

for (const file of sourceFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file);
    const source = sourceFile(file, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const usedKeys = [];

    const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            const name = node.expression.text;
            if (['t', 'tf', 'translate', 'translateFallback'].includes(name)) {
                const index = name.startsWith('translate') ? 1 : 0;
                const argument = node.arguments[index];
                if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
                    usedKeys.push({ key: argument.text, node });
                }
            }
            if (['setError', 'setMessage'].includes(name)) {
                const argument = node.arguments[0];
                if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
                    const text = normalized(argument.text);
                    if (text && /[A-Za-zÀ-ÿ]/.test(text)) {
                        errors.push(`${relative}:${lineOf(source, node)} hard-coded user feedback: ${text}`);
                    }
                }
            }
        }

        if (!localeSpecificFiles.has(relative) && ts.isJsxText(node)) {
            const text = normalized(node.text);
            if (text && /[A-Za-zÀ-ÿ]/.test(text) && !allowedVisibleText.has(text)) {
                errors.push(`${relative}:${lineOf(source, node)} hard-coded JSX text: ${text}`);
            }
        }

        if (!localeSpecificFiles.has(relative) && ts.isJsxAttribute(node) && visibleAttributes.has(node.name.text)) {
            const initializer = node.initializer;
            const text = initializer && ts.isStringLiteral(initializer) ? normalized(initializer.text) : '';
            if (text && /[A-Za-zÀ-ÿ]/.test(text) && !allowedVisibleAttributes.has(text)) {
                errors.push(`${relative}:${lineOf(source, node)} hard-coded visible attribute: ${text}`);
            }
        }

        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'TEXTS') {
            const object = node.initializer;
            if (object && ts.isObjectLiteralExpression(object)) {
                const keys = new Set(object.properties
                    .filter(ts.isPropertyAssignment)
                    .map((property) => propertyName(property.name))
                    .filter(Boolean));
                if (keys.has('it') && keys.has('en')) {
                    const missing = languages.filter((language) => !keys.has(language));
                    if (missing.length) errors.push(`${relative}:${lineOf(source, node)} TEXTS missing languages: ${missing.join(', ')}`);
                    const fieldsByLanguage = new Map();
                    for (const property of object.properties.filter(ts.isPropertyAssignment)) {
                        const language = propertyName(property.name);
                        if (!language || !ts.isObjectLiteralExpression(property.initializer)) continue;
                        fieldsByLanguage.set(language, new Set(
                            property.initializer.properties
                                .filter(ts.isPropertyAssignment)
                                .map((field) => propertyName(field.name))
                                .filter(Boolean),
                        ));
                    }
                    const referenceFields = fieldsByLanguage.get('it') ?? new Set();
                    for (const language of languages) {
                        const translatedFields = fieldsByLanguage.get(language) ?? new Set();
                        const missingFields = [...referenceFields].filter((field) => !translatedFields.has(field));
                        if (missingFields.length) {
                            errors.push(`${relative}:${lineOf(source, node)} TEXTS ${language} missing fields: ${missingFields.join(', ')}`);
                        }
                    }
                }
            }
        }

        ts.forEachChild(node, visit);
    };
    visit(source);

    for (const { key, node } of usedKeys) {
        if (!allKeys.has(key)) errors.push(`${relative}:${lineOf(source, node)} unknown translation key: ${key}`);
    }
}

if (errors.length) {
    console.error(`i18n check failed (${errors.length} issues):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}

console.log(`i18n check passed: ${allKeys.size} keys across ${languages.length} languages`);
