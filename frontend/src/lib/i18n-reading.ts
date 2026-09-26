// Etichette di «La mia lettura» nella sezione Compilazioni. Sei lingue: gli
// studenti del progetto non parlano tutti italiano.
const text = {
    title: ['La mia lettura', 'My reading', 'Mi lectura', 'Ma lecture', 'Meine Lesung', 'Min läsning'],
    strengths: ['Punti di forza da valorizzare', 'Strengths to build on', 'Puntos fuertes para potenciar', 'Points forts à valoriser', 'Stärken, die ich einsetze', 'Styrkor att bygga på'],
    growth: ['Da far crescere', 'To grow', 'Para hacer crecer', 'À faire grandir', 'Zu entwickeln', 'Att utveckla'],
    note: ['Cosa mi dice di me', 'What it tells me about myself', 'Qué me dice de mí', 'Ce qu’il me dit de moi', 'Was es mir über mich sagt', 'Vad det säger om mig'],
    toGoal: ['→ Rendi obiettivo', '→ Make it a goal', '→ Hazlo objetivo', '→ Transforme en objectif', '→ Zum Ziel machen', '→ Gör till mål'],
    born: ['Obiettivi nati da qui', 'Goals born from here', 'Objetivos surgidos de aquí', 'Objectifs nés ici', 'Ziele, die hier entstanden sind', 'Mål som uppstod här'],
    save: ['Salva', 'Save', 'Guardar', 'Enregistrer', 'Speichern', 'Spara'],
    saved: ['Salvato.', 'Saved.', 'Guardado.', 'Enregistré.', 'Gespeichert.', 'Sparat.'],
} satisfies Record<string, [string, string, string, string, string, string]>;

const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'];
export type ReadingTextKey = keyof typeof text;
export function readingText(lang: string, key: ReadingTextKey): string {
    const index = languages.indexOf(lang);
    return text[key][index < 0 ? 1 : index];
}
