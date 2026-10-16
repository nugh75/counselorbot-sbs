import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { legacyRouteRedirects } from './legacy-routes.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { classPathText } from './i18n-class-paths.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { teacherAreaName, teacherAreaText } from './i18n-teacher-area.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { personalAreaName } from './i18n-personal-area.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { classSettingsText } from './i18n-class-settings.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { teacherAreaSlugs } from './teacher-area.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { personalAreaGroups } from './personal-area.ts';

// «Percorsi di classe» became «Piano operativo»: the guided paths of the
// instruments keep their name, the feature never shows the old one again.
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;
const plural = ['Piani operativi', 'Operational plans', 'Planes operativos', 'Plans opérationnels', 'Arbeitspläne', 'Arbetsplaner'];
const oldNames = /[Pp]ercors[oi] di classe|Percorsi didattici|[Cc]lass[- ]paths?\b|[Ii]tinerarios? de (la )?clase|[Rr]ecorridos de clase|[Pp]arcours de (la )?classe|Klassenpfad|Klassenweg|[Kk]lassväg/;

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) return sourceFiles(file);
        return /\.tsx?$/.test(name) && !name.includes('.test.') ? [file] : [];
    });
}

test('the feature is called «Piano operativo» in every language and place', () => {
    languages.forEach((lang, index) => {
        assert.equal(classPathText(lang, 'pathsTitle'), plural[index]);
        assert.equal(teacherAreaName(lang, 'piani-operativi'), plural[index]);
        assert.equal(teacherAreaText(lang, 'breadcrumbPercorsi'), plural[index]);
        assert.equal(personalAreaName(lang, 'piani-operativi'), plural[index]);
        assert.equal(classSettingsText(lang, 'paths'), plural[index]);
        assert.equal(classSettingsText(lang, 'classPaths'), plural[index]);
    });
    assert.equal(classPathText('it', 'newPath'), 'Nuovo piano operativo');
    assert.equal(classPathText('it', 'yourClassPath'), 'Il tuo piano operativo');
    assert.equal(classPathText('fr', 'publishedSuccess'), 'Plan opérationnel publié');
});

test('no visible text keeps the old name, guided paths keep theirs', () => {
    const texts = sourceFiles(path.join(src, 'lib')).filter(file => /i18n[^/]*\.tsx?$/.test(file))
        .concat(path.join(src, 'components/teacher/class-group-texts.ts'));
    for (const file of texts) {
        readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
            if (/^\s*(\/\/|\*)/.test(line)) return;
            assert.doesNotMatch(line, oldNames, `${path.relative(src, file)}:${index + 1}`);
        });
    }
    const steps = readFileSync(path.join(src, 'lib/i18n-step-kinds.ts'), 'utf8');
    assert.match(steps, /'Scegli un percorso guidato…'/);
});

test('pages live at the new addresses and old ones redirect permanently', () => {
    assert.ok(existsSync(path.join(src, 'app/docente/piani-operativi/page.tsx')));
    assert.ok(existsSync(path.join(src, 'app/profilo/piani-operativi/page.tsx')));
    assert.ok(existsSync(path.join(src, 'app/profilo/piani-operativi/[pathId]/[stepId]/approfondimento/page.tsx')));
    assert.ok(!existsSync(path.join(src, 'app/docente/percorsi')));
    assert.ok(!existsSync(path.join(src, 'app/profilo/percorsi')));
    assert.deepEqual(legacyRouteRedirects, [
        { source: '/docente/percorsi/:path*', destination: '/docente/piani-operativi/:path*', permanent: true },
        { source: '/profilo/percorsi/:path*', destination: '/profilo/piani-operativi/:path*', permanent: true },
    ]);
    assert.ok(teacherAreaSlugs.includes('piani-operativi'));
    assert.ok(personalAreaGroups.some(group => (group.slugs as readonly string[]).includes('piani-operativi')));
});

test('internal links point to the new addresses', () => {
    for (const file of sourceFiles(src)) {
        if (file.endsWith('legacy-routes.ts')) continue;
        assert.doesNotMatch(readFileSync(file, 'utf8'), /\/(docente|profilo)\/percorsi\b/, path.relative(src, file));
    }
});
