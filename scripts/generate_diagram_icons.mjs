// Rebuild the selected Lucide assets and frontend allowlist from one catalogue.
// Run from any directory: node scripts/generate_diagram_icons.mjs [--check]
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const require = createRequire(new URL('frontend/package.json', root));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const lucide = require('lucide-react');
const sharp = require('sharp');
const catalog = JSON.parse(await readFile(new URL('backend/diagram_icon_catalog.json', root), 'utf8'));
const check = process.argv.includes('--check');

async function output(relative, value) {
    const path = new URL(relative, root);
    if (check) {
        const existing = await readFile(path);
        if (!existing.equals(Buffer.from(value))) throw new Error(`Outdated generated file: ${relative}`);
    } else {
        await writeFile(path, value);
    }
}

for (const entry of catalog.filter(entry => entry.lucide)) {
    const icon = lucide[entry.lucide];
    if (!icon) throw new Error(`Unknown Lucide icon: ${entry.lucide}`);
    const svg = renderToStaticMarkup(React.createElement(icon, { color: '#17747a', 'aria-hidden': true }));
    await output(`backend/diagram_icons/${entry.id}.svg`, `${svg}\n`);
    for (const [theme, color] of [['light', '#17747a'], ['dark', '#9acbcd']]) {
        const png = await sharp(Buffer.from(svg.replaceAll('#17747a', color))).resize(48, 48).png().toBuffer();
        await output(`backend/diagram_icons/${entry.id}-${theme}.png`, png);
    }
}

const path = new URL('frontend/src/lib/diagram-content.ts', root);
const current = await readFile(path, 'utf8');
const ids = catalog.map(entry => `'${entry.id}'`);
const updated = current
    .replace(/^export type DiagramIcon = .*;$/m, `export type DiagramIcon = ${ids.join(' | ')};`)
    .replace(/^export const DIAGRAM_ICONS: DiagramIcon\[\] = .*;$/m, `export const DIAGRAM_ICONS: DiagramIcon[] = [${ids.join(', ')}];`);
await output('frontend/src/lib/diagram-content.ts', updated);
const license = new URL('backend/diagram_icons/LUCIDE-LICENSE', root);
if (check) {
    if (!(await readFile(license)).equals(await readFile(require.resolve('lucide-react/LICENSE')))) {
        throw new Error('Lucide license differs from the installed package');
    }
} else {
    await copyFile(require.resolve('lucide-react/LICENSE'), fileURLToPath(license));
}

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const cards = [];
for (const entry of catalog) {
    const svg = await readFile(new URL(`backend/diagram_icons/${entry.id}.svg`, root), 'utf8');
    cards.push(`<article data-search="${escape(`${entry.label_it} ${entry.id} ${entry.meaning}`.toLowerCase())}">${svg}<h2>${escape(entry.label_it)}</h2><p>${escape(entry.meaning)}</p><code>${entry.id}</code></article>`);
}
if (!check) await mkdir(new URL('docs/diagrams/', root), { recursive: true });
await output('docs/diagrams/icon-catalog.html', `<!doctype html>
<html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Le 100 icone dei diagrammi — CounselorBot</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#334155;font:16px/1.5 Inter,system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:32px 20px}h1{font-size:28px;color:#155e63;margin:0 0 12px}header p{max-width:760px}label{display:block;font-weight:600;margin-top:24px}input{font:inherit;width:100%;padding:12px;border:1px solid #94a3b8;border-radius:8px;margin:8px 0}input:focus{outline:2px solid #17747a;outline-offset:2px}#count{margin:8px 0 20px;color:#64748b}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:12px}article{border:1px solid #cbd5e1;border-radius:8px;padding:18px 14px}article[hidden]{display:none}article svg{width:40px;height:40px}h2{font-size:15px;color:#155e63;line-height:1.35;margin:12px 0 6px}article p{font-size:13px;margin:0 0 8px}code{font-size:12px;color:#64748b}a{color:#155e63}footer{margin-top:32px;font-size:14px}@media(max-width:420px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:24px 12px}}
</style>
<main><header><h1>Le 100 icone dei diagrammi</h1><p>Ogni simbolo indica un significato preciso. Il testo del nodo resta essenziale: se il simbolo non rappresenta bene il concetto, il diagramma può usare una forma senza icona.</p><p>Un obiettivo da raggiungere non è un risultato ottenuto. Concetti astratti come l’autoefficacia possono rimanere testuali.</p></header>
<label for="search">Cerca un significato o un’icona</label><input id="search" type="search" placeholder="Per esempio: pianificazione, confronto, incertezza"><p id="count" role="status">100 icone</p>
<section class="grid" aria-label="Catalogo delle icone">${cards.join('\n')}</section>
<footer>90 nuove icone da <a href="https://lucide.dev/">Lucide</a>, versione ${require('lucide-react/package.json').version}; conservati i 10 simboli precedenti. Catalogo generato da <code>backend/diagram_icon_catalog.json</code>. Significati operativi in inglese per tutti i modelli e tutte le lingue.</footer></main>
<script>
const search=document.querySelector('#search');const cards=[...document.querySelectorAll('article')];
search.addEventListener('input',()=>{const query=search.value.trim().toLowerCase();let count=0;for(const card of cards){card.hidden=!card.dataset.search.includes(query);if(!card.hidden)count++;}document.querySelector('#count').textContent=count+' icone';});
</script></html>
`);
console.log(`${check ? 'Verified' : 'Generated'} ${catalog.length} icon definitions; Lucide ${require('lucide-react/package.json').version}.`);
