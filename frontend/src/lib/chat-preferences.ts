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
        "followup": "Puoi concludere oppure approfondire scrivendo qui."
    },
    "en": {
        "format": "Format",
        "standard": "Conversational",
        "bullets": "Bullet points",
        "table": "Table",
        "choose": "How would you like to explore your profile?",
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
        "followup": "You can finish or write here to explore further."
    },
    "es": {
        "format": "Formato",
        "standard": "Conversacional",
        "bullets": "Por puntos",
        "table": "Tabla",
        "choose": "¿Cómo quieres explorar tu perfil?",
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
        "followup": "Puedes concluir o escribir aquí para profundizar."
    },
    "fr": {
        "format": "Format",
        "standard": "Conversationnel",
        "bullets": "Liste",
        "table": "Tableau",
        "choose": "Comment souhaitez-vous explorer votre profil ?",
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
        "followup": "Vous pouvez terminer ou écrire ici pour approfondir."
    },
    "de": {
        "format": "Format",
        "standard": "Fließtext",
        "bullets": "Stichpunkte",
        "table": "Tabelle",
        "choose": "Wie möchtest du dein Profil erkunden?",
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
        "followup": "Du kannst abschließen oder hier zur Vertiefung schreiben."
    },
    "sv": {
        "format": "Format",
        "standard": "Löptext",
        "bullets": "Punktlista",
        "table": "Tabell",
        "choose": "Hur vill du utforska din profil?",
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
        "followup": "Du kan avsluta eller skriva här för att fördjupa samtalet."
    }
};

export function chatPreferenceLabel(lang: Lang, key: keyof typeof labels.it): string {
    return (labels[lang] || labels.en)[key];
}

export const ESSENTIAL_PHASES = ['qsa-essential-focus', 'qsa-essential-experience', 'qsa-essential-action', 'qsa-essential-summary'] as const;

export function nextEssentialPhase(phase: string): string {
    const index = ESSENTIAL_PHASES.indexOf(phase as typeof ESSENTIAL_PHASES[number]);
    return ESSENTIAL_PHASES[Math.min(Math.max(index + 1, 0), ESSENTIAL_PHASES.length - 1)];
}

export function essentialSteps(lang: Lang) {
    const names = ['focus', 'experience', 'action', 'summary'] as const;
    return ESSENTIAL_PHASES.map((id, index) => ({ id, sort_order: index, label: chatPreferenceLabel(lang, names[index]), system_prompt_mode: 'generic', color_theme: 'indigo' }));
}
