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
        "essentialHelp": "3 fasi brevi (focus, esempio, azione), poi una sintesi. Puoi scegliere di approfondire o proseguire.",
        "start": "Inizia",
        "focus": "Scegliere il focus",
        "experience": "Un esempio concreto",
        "action": "Un primo passo",
        "summary": "Sintesi",
        "finish": "Concludi",
        "followup": "Puoi concludere oppure approfondire scrivendo qui.",
        "focusDraft": "Focus e prima bozza",
        "completeObjective": "Completare l'obiettivo",
        "planProof": "Piano e prova",
        "alignAssess": "Attività e verifica",
        "essentialHelpGoal": "3 fasi brevi (focus, obiettivo, piano), poi una sintesi: si passa avanti quando la fase è pronta o quando scegli di proseguire."
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
        "essentialHelp": "3 short stages (focus, example, action), then a summary. You can choose to explore further or continue.",
        "start": "Start",
        "focus": "Choose a focus",
        "experience": "A concrete example",
        "action": "A first step",
        "summary": "Summary",
        "finish": "Finish",
        "followup": "You can finish or write here to explore further.",
        "focusDraft": "Focus and first draft",
        "completeObjective": "Complete the objective",
        "planProof": "Plan and proof",
        "alignAssess": "Activities and assessment",
        "essentialHelpGoal": "3 short stages (focus, objective, plan), then a summary: you move on when a stage is ready or when you choose to."
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
        "essentialHelp": "3 fases breves (foco, ejemplo, acción) y una síntesis. Puedes elegir profundizar o continuar.",
        "start": "Empezar",
        "focus": "Elegir un tema",
        "experience": "Un ejemplo concreto",
        "action": "Un primer paso",
        "summary": "Síntesis",
        "finish": "Concluir",
        "followup": "Puedes concluir o escribir aquí para profundizar.",
        "focusDraft": "Foco y primer borrador",
        "completeObjective": "Completar el objetivo",
        "planProof": "Plan y prueba",
        "alignAssess": "Actividades y evaluación",
        "essentialHelpGoal": "3 fases breves (foco, objetivo, plan) y una síntesis: se avanza cuando la fase está lista o cuando decides continuar."
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
        "essentialHelp": "3 étapes brèves (focus, exemple, action), puis une synthèse. Vous pouvez choisir d’approfondir ou de continuer.",
        "start": "Commencer",
        "focus": "Choisir un sujet",
        "experience": "Un exemple concret",
        "action": "Un premier pas",
        "summary": "Synthèse",
        "finish": "Terminer",
        "followup": "Vous pouvez terminer ou écrire ici pour approfondir.",
        "focusDraft": "Focus et première ébauche",
        "completeObjective": "Compléter l’objectif",
        "planProof": "Plan et preuve",
        "alignAssess": "Activités et évaluation",
        "essentialHelpGoal": "3 étapes brèves (focus, objectif, plan), puis une synthèse : on avance quand l’étape est prête ou quand vous choisissez de continuer."
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
        "essentialHelp": "3 kurze Phasen (Fokus, Beispiel, Handlung), dann eine Zusammenfassung. Du kannst vertiefen oder weitergehen.",
        "start": "Beginnen",
        "focus": "Schwerpunkt wählen",
        "experience": "Ein konkretes Beispiel",
        "action": "Ein erster Schritt",
        "summary": "Zusammenfassung",
        "finish": "Abschließen",
        "followup": "Du kannst abschließen oder hier zur Vertiefung schreiben.",
        "focusDraft": "Fokus und erster Entwurf",
        "completeObjective": "Ziel vervollständigen",
        "planProof": "Plan und Nachweis",
        "alignAssess": "Aktivitäten und Überprüfung",
        "essentialHelpGoal": "3 kurze Phasen (Fokus, Ziel, Plan), dann eine Zusammenfassung: Es geht weiter, wenn eine Phase fertig ist oder wenn du weitermachen möchtest."
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
        "essentialHelp": "3 korta faser (fokus, exempel, handling), sedan en sammanfattning. Du kan välja att fördjupa eller gå vidare.",
        "start": "Börja",
        "focus": "Välj fokus",
        "experience": "Ett konkret exempel",
        "action": "Ett första steg",
        "summary": "Sammanfattning",
        "finish": "Avsluta",
        "followup": "Du kan avsluta eller skriva här för att fördjupa samtalet.",
        "focusDraft": "Fokus och första utkast",
        "completeObjective": "Komplettera målet",
        "planProof": "Plan och bevis",
        "alignAssess": "Aktiviteter och bedömning",
        "essentialHelpGoal": "3 korta faser (fokus, mål, plan), sedan en sammanfattning: du går vidare när en fas är klar eller när du väljer det."
    }
};

export function chatPreferenceLabel(lang: Lang, key: keyof typeof labels.it): string {
    return (labels[lang] || labels.en)[key];
}

// Tre fasi brevi e sintesi; si avanza sul segnale dopo una scelta risolta.
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

// Ogni percorso essenziale chiude la fase sul marcatore.
export function essentialAdvancesOnSignal(type: string): boolean {
    return isEssentialInstrument(type);
}

// Chiarimenti e approfondimenti restano nella fase corrente fino alla chiusura.
export function essentialReplyPhase(type: string, phase: string): string {
    return essentialAdvancesOnSignal(type) ? phase : nextEssentialPhase(phase);
}

// Solo una risposta completata (stream chiuso con done) puo' far avanzare.
// Nelle aperture, senza una risposta della persona, avanza solo «completare
// l'obiettivo» quando trova l'obiettivo gia' definito.
export function essentialSignalAdvances(
    type: string,
    phase: string,
    turn: { completed: boolean; marker: boolean; entry: boolean },
): boolean {
    if (!essentialAdvancesOnSignal(type) || !turn.completed || !turn.marker) return false;
    if (isEssentialSummaryPhase(phase)) return false;
    return !turn.entry || phase.endsWith('-essential-smart');
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
        : ['focusDraft', 'completeObjective', type === 'OBIETTIVO_DOCENZA' ? 'alignAssess' : 'planProof', 'summary'];
    return phases.map((id, index) => ({ id, sort_order: index, label: chatPreferenceLabel(lang, names[index] as keyof typeof labels.it), system_prompt_mode: type === 'QSA' ? 'generic' : 'obiettivo-interview', color_theme: 'indigo' }));
}
