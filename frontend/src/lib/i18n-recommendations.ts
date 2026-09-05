// Testi delle azioni sulle raccomandazioni (scelta, prova, riscontro, archivio).
// Stanno qui e non in `i18n.ts` per lo stesso motivo di `i18n-diagram.ts`: sono
// le parole di un solo pannello e si leggono meglio vicine fra loro.
//
// La funzione non si chiama `t`: `scripts/check-i18n.mjs` verifica le chiavi di
// `t()` contro i dizionari generali, e queste non ci sono.

import type { Lang } from './i18n';

type Dict = typeof it;
export type RecommendationTextKey = keyof Dict;

const it = {
    'summary': 'Di cosa parla',
    'synopsis.show': 'Leggi la sintesi',
    'synopsis.hide': 'Chiudi la sintesi',
    'reading.select': 'Mi interessa',
    'reading.tried': 'Già letto',
    'strategy.select': 'Voglio provarla',
    'strategy.tried': 'Provata',
    'discuss': 'Riprendi in chat',
    'discuss.reading.prompt': 'Vorrei approfondire «{title}»: perché può servirmi e come potrei usarlo?',
    'discuss.strategy.prompt': 'Vorrei approfondire la strategia «{name}»: come posso metterla in pratica?',
    'helpful.question': 'Ti è servita?',
    'helpful.yes': 'Sì, mi è servita',
    'helpful.no': 'No, non mi è servita',
    'dismiss': 'Archivia',
    'restore': 'Rimetti tra le proposte',
    'archived.show': 'Mostra gli archiviati ({count})',
    'archived.hide': 'Nascondi gli archiviati',
    'saving': 'Salvataggio…',
    'error': 'Non è stato possibile salvare la scelta.',
    'retry': 'Riprova',
    'provenance.themes': 'Proposta a partire da ciò di cui stavi parlando.',
    'provenance.scores': 'Proposta a partire dai tuoi punteggi.',
    'provenance.scope': 'Proposta per lo strumento che stai usando.',
};

const en: Dict = {
    'summary': 'What it is about',
    'synopsis.show': 'Read the summary',
    'synopsis.hide': 'Close the summary',
    'reading.select': 'I am interested',
    'reading.tried': 'Already read',
    'strategy.select': 'I want to try it',
    'strategy.tried': 'Tried',
    'discuss': 'Pick this up in chat',
    'discuss.reading.prompt': 'I would like to go deeper into “{title}”: why could it help me and how would I use it?',
    'discuss.strategy.prompt': 'I would like to go deeper into the “{name}” strategy: how can I put it into practice?',
    'helpful.question': 'Did it help?',
    'helpful.yes': 'Yes, it helped',
    'helpful.no': 'No, it did not help',
    'dismiss': 'Archive',
    'restore': 'Move back to the suggestions',
    'archived.show': 'Show archived ({count})',
    'archived.hide': 'Hide archived',
    'saving': 'Saving…',
    'error': 'Your choice could not be saved.',
    'retry': 'Try again',
    'provenance.themes': 'Suggested from what you were talking about.',
    'provenance.scores': 'Suggested from your scores.',
    'provenance.scope': 'Suggested for the tool you are using.',
};

const es: Dict = {
    'summary': 'De qué trata',
    'synopsis.show': 'Leer la sinopsis',
    'synopsis.hide': 'Cerrar la sinopsis',
    'reading.select': 'Me interesa',
    'reading.tried': 'Ya leído',
    'strategy.select': 'Quiero probarla',
    'strategy.tried': 'Probada',
    'discuss': 'Retomar en el chat',
    'discuss.reading.prompt': 'Me gustaría profundizar en «{title}»: ¿por qué puede servirme y cómo podría usarlo?',
    'discuss.strategy.prompt': 'Me gustaría profundizar en la estrategia «{name}»: ¿cómo puedo ponerla en práctica?',
    'helpful.question': '¿Te ha servido?',
    'helpful.yes': 'Sí, me ha servido',
    'helpful.no': 'No, no me ha servido',
    'dismiss': 'Archivar',
    'restore': 'Devolver a las propuestas',
    'archived.show': 'Mostrar archivados ({count})',
    'archived.hide': 'Ocultar archivados',
    'saving': 'Guardando…',
    'error': 'No se ha podido guardar tu elección.',
    'retry': 'Reintentar',
    'provenance.themes': 'Propuesta a partir de lo que estabas contando.',
    'provenance.scores': 'Propuesta a partir de tus puntuaciones.',
    'provenance.scope': 'Propuesta para la herramienta que estás usando.',
};

const fr: Dict = {
    'summary': 'De quoi il s’agit',
    'synopsis.show': 'Lire le résumé',
    'synopsis.hide': 'Fermer le résumé',
    'reading.select': 'Ça m’intéresse',
    'reading.tried': 'Déjà lu',
    'strategy.select': 'Je veux l’essayer',
    'strategy.tried': 'Essayée',
    'discuss': 'Reprendre dans le chat',
    'discuss.reading.prompt': 'J’aimerais approfondir « {title} » : en quoi cela peut m’aider et comment l’utiliser ?',
    'discuss.strategy.prompt': 'J’aimerais approfondir la stratégie « {name} » : comment la mettre en pratique ?',
    'helpful.question': 'Est-ce que ça t’a aidé ?',
    'helpful.yes': 'Oui, ça m’a aidé',
    'helpful.no': 'Non, ça ne m’a pas aidé',
    'dismiss': 'Archiver',
    'restore': 'Remettre dans les propositions',
    'archived.show': 'Afficher les éléments archivés ({count})',
    'archived.hide': 'Masquer les éléments archivés',
    'saving': 'Enregistrement…',
    'error': 'Impossible d’enregistrer ce choix.',
    'retry': 'Réessayer',
    'provenance.themes': 'Proposé à partir de ce dont tu parlais.',
    'provenance.scores': 'Proposé à partir de tes scores.',
    'provenance.scope': 'Proposé pour l’outil que tu utilises.',
};

const de: Dict = {
    'summary': 'Worum es geht',
    'synopsis.show': 'Zusammenfassung lesen',
    'synopsis.hide': 'Zusammenfassung schließen',
    'reading.select': 'Interessiert mich',
    'reading.tried': 'Schon gelesen',
    'strategy.select': 'Ich will sie ausprobieren',
    'strategy.tried': 'Ausprobiert',
    'discuss': 'Im Chat aufgreifen',
    'discuss.reading.prompt': 'Ich möchte tiefer auf „{title}“ eingehen: Warum kann es mir helfen und wie würde ich es nutzen?',
    'discuss.strategy.prompt': 'Ich möchte tiefer auf die Strategie „{name}“ eingehen: Wie kann ich sie im Alltag umsetzen?',
    'helpful.question': 'Hat sie dir geholfen?',
    'helpful.yes': 'Ja, sie hat geholfen',
    'helpful.no': 'Nein, sie hat nicht geholfen',
    'dismiss': 'Archivieren',
    'restore': 'Zurück zu den Vorschlägen',
    'archived.show': 'Archivierte anzeigen ({count})',
    'archived.hide': 'Archivierte ausblenden',
    'saving': 'Wird gespeichert…',
    'error': 'Die Auswahl konnte nicht gespeichert werden.',
    'retry': 'Erneut versuchen',
    'provenance.themes': 'Vorgeschlagen anhand dessen, worüber du gesprochen hast.',
    'provenance.scores': 'Vorgeschlagen anhand deiner Werte.',
    'provenance.scope': 'Vorgeschlagen für das Werkzeug, das du gerade nutzt.',
};

const sv: Dict = {
    'summary': 'Vad den handlar om',
    'synopsis.show': 'Läs sammanfattningen',
    'synopsis.hide': 'Stäng sammanfattningen',
    'reading.select': 'Intresserar mig',
    'reading.tried': 'Redan läst',
    'strategy.select': 'Jag vill prova den',
    'strategy.tried': 'Provad',
    'discuss': 'Ta upp i chatten',
    'discuss.reading.prompt': 'Jag vill gå djupare in på ”{title}”: varför kan den hjälpa mig och hur skulle jag använda den?',
    'discuss.strategy.prompt': 'Jag vill gå djupare in på strategin ”{name}”: hur kan jag använda den i praktiken?',
    'helpful.question': 'Hjälpte den?',
    'helpful.yes': 'Ja, den hjälpte',
    'helpful.no': 'Nej, den hjälpte inte',
    'dismiss': 'Arkivera',
    'restore': 'Lägg tillbaka bland förslagen',
    'archived.show': 'Visa arkiverade ({count})',
    'archived.hide': 'Dölj arkiverade',
    'saving': 'Sparar…',
    'error': 'Det gick inte att spara valet.',
    'retry': 'Försök igen',
    'provenance.themes': 'Föreslagen utifrån det du berättade om.',
    'provenance.scores': 'Föreslagen utifrån dina poäng.',
    'provenance.scope': 'Föreslagen för verktyget du använder.',
};

const DICTS: Record<Lang, Dict> = { it, en, es, fr, de, sv };

export function recommendationText(
    key: RecommendationTextKey,
    lang: string,
    vars?: Record<string, string | number>,
): string {
    const dict = DICTS[(lang || 'it').slice(0, 2) as Lang] ?? en;
    const value = dict[key];
    if (!vars) return value;
    return value.replace(/\{(\w+)\}/g, (match, name: string) => (
        name in vars ? String(vars[name]) : match
    ));
}
