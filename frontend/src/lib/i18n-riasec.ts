// Testi dell'O*NET Interest Profiler Short Form (RIASEC). Le sei lingue sono
// traduzioni CounselorBot da validare; il tedesco degli item riprende la
// versione tedesca pubblicata (CC BY 4.0), vedi backend/riasec.py.
import type { Lang } from './i18n';

type Dict = Record<string, string>;

const TEXT: Record<Lang, Dict> = {
    it: {
        'student.intro': 'Queste sono le tue piste di interesse. Sono spunti da esplorare, non una scelta già decisa.',
        'student.top': 'Piste da esplorare',
        'student.note': 'Gli interessi possono cambiare con le esperienze: usa queste piste per immaginare attività da provare.',
        'student.area.R': 'Attività pratiche e concrete: costruire, riparare, usare strumenti e macchine.',
        'student.area.I': 'Analisi e ricerca: osservare, sperimentare, capire come funzionano le cose.',
        'student.area.A': 'Creatività ed espressione: scrivere, disegnare, suonare, creare.',
        'student.area.S': 'Relazione e aiuto: insegnare, ascoltare, prendersi cura delle persone.',
        'student.area.E': 'Iniziativa e guida: organizzare, negoziare, vendere, avviare progetti.',
        'student.area.C': 'Organizzazione e precisione: dati, procedure, registri e strumenti informatici.',
        'teacher.intro': 'Risultato esplorativo: il codice Holland a tre lettere è per il docente e non viene mostrato allo studente.',
        'teacher.code': 'Codice Holland',
        'teacher.dimensions': 'Punteggi per area (0-40)',
        'credit.heading': 'Fonte e licenza',
    },
    en: {
        'student.intro': 'These are your interest paths. They are leads to explore, not a decision already made.',
        'student.top': 'Paths to explore',
        'student.note': 'Interests can change with experience: use these paths to imagine activities to try.',
        'student.area.R': 'Practical, hands-on activities: building, repairing, using tools and machines.',
        'student.area.I': 'Analysis and research: observing, experimenting, understanding how things work.',
        'student.area.A': 'Creativity and expression: writing, drawing, playing music, creating.',
        'student.area.S': 'Relating and helping: teaching, listening, caring for people.',
        'student.area.E': 'Initiative and leadership: organising, negotiating, selling, starting projects.',
        'student.area.C': 'Organisation and precision: data, procedures, records and computer tools.',
        'teacher.intro': 'Exploratory result: the three-letter Holland code is for the teacher and is not shown to the student.',
        'teacher.code': 'Holland code',
        'teacher.dimensions': 'Area scores (0-40)',
        'credit.heading': 'Source and licence',
    },
    es: {
        'student.intro': 'Estas son tus pistas de interés. Son ideas para explorar, no una decisión ya tomada.',
        'student.top': 'Pistas para explorar',
        'student.note': 'Los intereses pueden cambiar con las experiencias: usa estas pistas para imaginar actividades que probar.',
        'student.area.R': 'Actividades prácticas y concretas: construir, reparar, usar herramientas y máquinas.',
        'student.area.I': 'Análisis e investigación: observar, experimentar, entender cómo funcionan las cosas.',
        'student.area.A': 'Creatividad y expresión: escribir, dibujar, tocar música, crear.',
        'student.area.S': 'Relación y ayuda: enseñar, escuchar, cuidar de las personas.',
        'student.area.E': 'Iniciativa y liderazgo: organizar, negociar, vender, poner en marcha proyectos.',
        'student.area.C': 'Organización y precisión: datos, procedimientos, registros y herramientas informáticas.',
        'teacher.intro': 'Resultado exploratorio: el código Holland de tres letras es para el docente y no se muestra al estudiante.',
        'teacher.code': 'Código Holland',
        'teacher.dimensions': 'Puntuaciones por área (0-40)',
        'credit.heading': 'Fuente y licencia',
    },
    fr: {
        'student.intro': "Voici tes pistes d'intérêt. Ce sont des idées à explorer, pas une décision déjà prise.",
        'student.top': 'Pistes à explorer',
        'student.note': "Les intérêts peuvent évoluer avec les expériences : utilise ces pistes pour imaginer des activités à essayer.",
        'student.area.R': 'Activités pratiques et concrètes : construire, réparer, utiliser des outils et des machines.',
        'student.area.I': 'Analyse et recherche : observer, expérimenter, comprendre le fonctionnement des choses.',
        'student.area.A': "Créativité et expression : écrire, dessiner, jouer de la musique, créer.",
        'student.area.S': 'Relation et aide : enseigner, écouter, prendre soin des personnes.',
        'student.area.E': 'Initiative et leadership : organiser, négocier, vendre, lancer des projets.',
        'student.area.C': 'Organisation et précision : données, procédures, registres et outils informatiques.',
        'teacher.intro': "Résultat exploratoire : le code Holland à trois lettres est destiné à l'enseignant et n'est pas montré à l'étudiant.",
        'teacher.code': 'Code Holland',
        'teacher.dimensions': 'Scores par domaine (0-40)',
        'credit.heading': 'Source et licence',
    },
    de: {
        'student.intro': 'Das sind deine Interessensspuren. Sie sind Anregungen zum Erkunden, keine bereits getroffene Entscheidung.',
        'student.top': 'Spuren zum Erkunden',
        'student.note': 'Interessen können sich mit Erfahrungen verändern: Nutze diese Spuren, um Aktivitäten auszuprobieren.',
        'student.area.R': 'Praktische, konkrete Tätigkeiten: bauen, reparieren, Werkzeuge und Maschinen nutzen.',
        'student.area.I': 'Analyse und Forschung: beobachten, experimentieren, verstehen, wie Dinge funktionieren.',
        'student.area.A': 'Kreativität und Ausdruck: schreiben, zeichnen, Musik machen, gestalten.',
        'student.area.S': 'Beziehung und Hilfe: unterrichten, zuhören, sich um Menschen kümmern.',
        'student.area.E': 'Initiative und Führung: organisieren, verhandeln, verkaufen, Projekte starten.',
        'student.area.C': 'Organisation und Genauigkeit: Daten, Verfahren, Register und Informatikwerkzeuge.',
        'teacher.intro': 'Exploratives Ergebnis: Der dreistellige Holland-Code ist für die Lehrperson und wird der Schülerin oder dem Schüler nicht angezeigt.',
        'teacher.code': 'Holland-Code',
        'teacher.dimensions': 'Werte pro Bereich (0-40)',
        'credit.heading': 'Quelle und Lizenz',
    },
    sv: {
        'student.intro': 'Det här är dina intressespår. De är uppslag att utforska, inte ett beslut som redan är fattat.',
        'student.top': 'Spår att utforska',
        'student.note': 'Intressen kan förändras med erfarenheter: använd spåren för att föreställa dig aktiviteter att prova.',
        'student.area.R': 'Praktiska och konkreta aktiviteter: bygga, reparera, använda verktyg och maskiner.',
        'student.area.I': 'Analys och forskning: observera, experimentera, förstå hur saker fungerar.',
        'student.area.A': 'Kreativitet och uttryck: skriva, teckna, spela musik, skapa.',
        'student.area.S': 'Relation och hjälp: undervisa, lyssna, ta hand om människor.',
        'student.area.E': 'Initiativ och ledarskap: organisera, förhandla, sälja, starta projekt.',
        'student.area.C': 'Organisation och noggrannhet: data, rutiner, register och datorverktyg.',
        'teacher.intro': 'Utforskande resultat: den trebokstaviga Holland-koden är för läraren och visas inte för eleven.',
        'teacher.code': 'Holland-kod',
        'teacher.dimensions': 'Poäng per område (0-40)',
        'credit.heading': 'Källa och licens',
    },
};

export function riasecText(lang: Lang, key: string): string {
    return TEXT[lang]?.[key] ?? TEXT.en[key] ?? key;
}

// Required credit text from the O*NET Tools Developer License. Kept verbatim;
// the questionnaire page shows it next to the localized heading.
export const RIASEC_CREDIT_EN =
    'This page includes information from the O*NET Career Exploration Tools by the U.S. Department of Labor, ' +
    'Employment and Training Administration (USDOL/ETA). Used under the O*NET Tools Developer License ' +
    '(https://www.onetcenter.org/license_tools.html). O*NET\u00ae is a trademark of USDOL/ETA. ' +
    'CounselorBot has modified all or some of this information. USDOL/ETA has not approved, endorsed, or ' +
    'tested these modifications. Source: O*NET Interest Profiler Short Form (v1).';
