import type { Lang } from './i18n';

export type ResponseFormat = 'standard' | 'bullets' | 'table';
export type GuidedPath = 'complete' | 'essential';

const labels = {
    "it": {
        "format": "Formato",
        "standard": "Discorsivo",
        "bullets": "Per punti",
        "table": "Tabella",
        "choose": "Come vuoi affrontare il tuo profilo?",
        "choosePath": "Come vuoi affrontare il percorso?",
        "complete": "Percorso completo",
        "completeHelp": "Esplora le diverse dimensioni.",
        "essential": "Percorso essenziale",
        "essentialHelp": "3 brevi risposte, poi una sintesi. Approfondimenti facoltativi.",
        "start": "Inizia",
        "focus": "Scegliere il focus",
        "experience": "Un esempio concreto",
        "action": "Un primo passo",
        "summary": "Sintesi",
        "finish": "Concludi",
        "followup": "Puoi concludere oppure approfondire scrivendo qui.",
        "areaLevel": "Area e livello",
        "smartCheck": "Verifica SMART",
        "planProof": "Piano e prova"
    },
    "en": {
        "format": "Format",
        "standard": "Conversational",
        "bullets": "Bullet points",
        "table": "Table",
        "choose": "How would you like to explore your profile?",
        "choosePath": "How would you like to approach this path?",
        "complete": "Complete path",
        "completeHelp": "Explore the different dimensions.",
        "essential": "Essential path",
        "essentialHelp": "3 short replies, then a summary. Further discussion is optional.",
        "start": "Start",
        "focus": "Choose a focus",
        "experience": "A concrete example",
        "action": "A first step",
        "summary": "Summary",
        "finish": "Finish",
        "followup": "You can finish or write here to explore further.",
        "areaLevel": "Area and level",
        "smartCheck": "SMART check",
        "planProof": "Plan and proof"
    },
    "es": {
        "format": "Formato",
        "standard": "Conversacional",
        "bullets": "Por puntos",
        "table": "Tabla",
        "choose": "¿Cómo quieres explorar tu perfil?",
        "choosePath": "¿Cómo quieres afrontar el recorrido?",
        "complete": "Recorrido completo",
        "completeHelp": "Explora las distintas dimensiones.",
        "essential": "Recorrido esencial",
        "essentialHelp": "3 respuestas breves y una síntesis. Profundizar es opcional.",
        "start": "Empezar",
        "focus": "Elegir un tema",
        "experience": "Un ejemplo concreto",
        "action": "Un primer paso",
        "summary": "Síntesis",
        "finish": "Concluir",
        "followup": "Puedes concluir o escribir aquí para profundizar.",
        "areaLevel": "Área y nivel",
        "smartCheck": "Prueba SMART",
        "planProof": "Plan y prueba"
    },
    "fr": {
        "format": "Format",
        "standard": "Conversationnel",
        "bullets": "Liste",
        "table": "Tableau",
        "choose": "Comment souhaitez-vous explorer votre profil ?",
        "choosePath": "Comment souhaitez-vous aborder ce parcours ?",
        "complete": "Parcours complet",
        "completeHelp": "Explorez les différentes dimensions.",
        "essential": "Parcours essentiel",
        "essentialHelp": "3 réponses brèves, puis une synthèse. Approfondissement facultatif.",
        "start": "Commencer",
        "focus": "Choisir un sujet",
        "experience": "Un exemple concret",
        "action": "Un premier pas",
        "summary": "Synthèse",
        "finish": "Terminer",
        "followup": "Vous pouvez terminer ou écrire ici pour approfondir.",
        "areaLevel": "Domaine et niveau",
        "smartCheck": "Épreuve SMART",
        "planProof": "Plan et preuve"
    },
    "de": {
        "format": "Format",
        "standard": "Fließtext",
        "bullets": "Stichpunkte",
        "table": "Tabelle",
        "choose": "Wie möchtest du dein Profil erkunden?",
        "choosePath": "Wie möchtest du diesen Weg angehen?",
        "complete": "Vollständiger Weg",
        "completeHelp": "Erkunde die verschiedenen Dimensionen.",
        "essential": "Kompakter Weg",
        "essentialHelp": "3 kurze Antworten, dann eine Zusammenfassung. Vertiefung ist freiwillig.",
        "start": "Beginnen",
        "focus": "Schwerpunkt wählen",
        "experience": "Ein konkretes Beispiel",
        "action": "Ein erster Schritt",
        "summary": "Zusammenfassung",
        "finish": "Abschließen",
        "followup": "Du kannst abschließen oder hier zur Vertiefung schreiben.",
        "areaLevel": "Bereich und Stufe",
        "smartCheck": "SMART-Test",
        "planProof": "Plan und Nachweis"
    },
    "sv": {
        "format": "Format",
        "standard": "Löptext",
        "bullets": "Punktlista",
        "table": "Tabell",
        "choose": "Hur vill du utforska din profil?",
        "choosePath": "Hur vill du lägga upp arbetet?",
        "complete": "Fullständig väg",
        "completeHelp": "Utforska de olika dimensionerna.",
        "essential": "Kort väg",
        "essentialHelp": "3 korta svar, sedan en sammanfattning. Fördjupning är valfri.",
        "start": "Börja",
        "focus": "Välj fokus",
        "experience": "Ett konkret exempel",
        "action": "Ett första steg",
        "summary": "Sammanfattning",
        "finish": "Avsluta",
        "followup": "Du kan avsluta eller skriva här för att fördjupa samtalet.",
        "areaLevel": "Område och nivå",
        "smartCheck": "SMART-test",
        "planProof": "Plan och bevis"
    }
};

export function chatPreferenceLabel(lang: Lang, key: keyof typeof labels.it): string {
    return (labels[lang] || labels.en)[key];
}

// Percorsi con versione essenziale: il QSA è stato il primo; i due percorsi
// Obiettivo riusano lo stesso meccanismo (fasi virtuali fuori dalla tabella
// degli step, il client avanza dopo ogni risposta completata).
export const ESSENTIAL_INSTRUMENTS = ['QSA', 'OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA'] as const;
export type EssentialInstrument = (typeof ESSENTIAL_INSTRUMENTS)[number];

export function isEssentialInstrument(type: string): type is EssentialInstrument {
    return (ESSENTIAL_INSTRUMENTS as readonly string[]).includes(type);
}

export const ESSENTIAL_PHASES = ['qsa-essential-focus', 'qsa-essential-experience', 'qsa-essential-action', 'qsa-essential-summary'] as const;

const OBBSTUDIO_ESSENTIAL_PHASES = ['obbstudio-essential-focus', 'obbstudio-essential-smart', 'obbstudio-essential-plan', 'obbstudio-essential-summary'] as const;
const OBBDOCENZA_ESSENTIAL_PHASES = ['obbdocenza-essential-focus', 'obbdocenza-essential-smart', 'obbdocenza-essential-plan', 'obbdocenza-essential-summary'] as const;

// Ogni fase ha un prefisso per strumento: il percorso si riconosce dalla fase,
// quindi l'avanzamento non ha bisogno del tipo della richiesta.
const ESSENTIAL_PHASES_BY_PREFIX: ReadonlyArray<readonly string[]> = [
    ESSENTIAL_PHASES,
    OBBSTUDIO_ESSENTIAL_PHASES,
    OBBDOCENZA_ESSENTIAL_PHASES,
];

export function essentialPhasesFor(type: string): readonly string[] {
    if (type === 'OBIETTIVO_STUDIO') return OBBSTUDIO_ESSENTIAL_PHASES;
    if (type === 'OBIETTIVO_DOCENZA') return OBBDOCENZA_ESSENTIAL_PHASES;
    if (type === 'QSA') return ESSENTIAL_PHASES;
    throw new Error(`Unsupported essential instrument: ${type}`);
}

export function nextEssentialPhase(phase: string): string {
    const phases = ESSENTIAL_PHASES_BY_PREFIX.find((candidates) => candidates.includes(phase)) ?? ESSENTIAL_PHASES;
    const index = phases.indexOf(phase);
    return phases[Math.min(Math.max(index + 1, 0), phases.length - 1)];
}

export function isEssentialSummaryPhase(phase: string): boolean {
    return phase.endsWith('-essential-summary');
}

export function essentialSteps(type: string, lang: Lang) {
    const phases = essentialPhasesFor(type);
    const names: readonly string[] = type === 'QSA'
        ? ['focus', 'experience', 'action', 'summary']
        : ['areaLevel', 'smartCheck', 'planProof', 'summary'];
    return phases.map((id, index) => ({ id, sort_order: index, label: chatPreferenceLabel(lang, names[index] as keyof typeof labels.it), system_prompt_mode: type === 'QSA' ? 'generic' : 'obiettivo-interview', color_theme: 'indigo' }));
}
