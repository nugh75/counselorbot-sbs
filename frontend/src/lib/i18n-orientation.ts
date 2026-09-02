import type { Lang } from './i18n';

type Dict = Record<string, string>;

const it: Dict = {
    'nav.orientation': 'Bussola',
    'orientation.eyebrow': 'Orientamento iniziale',
    'orientation.title': 'Bussola CounselorBot',
    'orientation.subtitle': 'Racconta cosa vuoi affrontare: la Bussola collega le tue parole agli strumenti disponibili e ti consiglia da dove iniziare.',
    'orientation.landing.latest': 'Rivedi l’ultimo orientamento',
    'orientation.landing.open': 'Apri la Bussola',
    'orientation.landing.new': 'Inizia un nuovo orientamento',
    'orientation.counselor.step': 'Prima scelta',
    'orientation.counselor.title': 'Con quale counselor vuoi parlare?',
    'orientation.counselor.body': 'Scegli prima la voce e l’approccio che ti accompagneranno. La scelta resterà legata a questa conversazione della Bussola.',
    'orientation.input.placeholder': 'Scrivi cosa ti porta qui, una difficoltà, una scelta o un obiettivo…',
    'orientation.input.send': 'Invia alla Bussola',
    'orientation.processing': 'La Bussola sta collegando ciò che hai scritto agli strumenti…',
    'orientation.recommendations.title': 'Strumenti da esplorare',
    'orientation.recommendations.subtitle': 'Sono proposte orientative, non valutazioni. Puoi continuare a parlare prima di scegliere.',
    'orientation.recommendation.start': 'Esplora questo strumento',
    'orientation.complete': 'Concludi l’orientamento',
    'orientation.completed.title': 'La rotta è pronta',
    'orientation.completed.body': 'Puoi aprire uno degli strumenti proposti e aggiornare il Taccuino qui sotto. La Bussola resterà sempre disponibile.',
    'orientation.continue': 'Continua da dove eri diretto',
    'orientation.error': 'Non riesco a completare questa azione. Riprova.',
};

const en: Dict = {
    'nav.orientation': 'Compass', 'orientation.eyebrow': 'Initial orientation', 'orientation.title': 'CounselorBot Compass',
    'orientation.subtitle': 'Describe what you want to address: the Compass connects your words to available tools and advises you where to begin.',
    'orientation.landing.latest': 'Review the latest orientation', 'orientation.landing.open': 'Open the Compass', 'orientation.landing.new': 'Start a new orientation',
    'orientation.counselor.step': 'First choice', 'orientation.counselor.title': 'Which counselor would you like to talk to?', 'orientation.counselor.body': 'First choose the voice and approach that will accompany you. The choice stays with this Compass conversation.',
    'orientation.input.placeholder': 'Write what brings you here, a difficulty, a choice or a goal…', 'orientation.input.send': 'Send to the Compass',
    'orientation.processing': 'The Compass is connecting what you wrote to the tools…',
    'orientation.recommendations.title': 'Tools to explore', 'orientation.recommendations.subtitle': 'These are orientation suggestions, not assessments. You can keep talking before choosing.',
    'orientation.recommendation.start': 'Explore this tool', 'orientation.complete': 'Complete orientation', 'orientation.completed.title': 'Your route is ready',
    'orientation.completed.body': 'Open a suggested tool and update your notebook below. The Compass will always remain available.',
    'orientation.continue': 'Continue to your previous destination', 'orientation.error': 'This action could not be completed. Try again.',
};

const es: Dict = {
    'nav.orientation': 'Brújula', 'orientation.eyebrow': 'Orientación inicial', 'orientation.title': 'Brújula CounselorBot',
    'orientation.subtitle': 'Cuenta qué quieres abordar: la Brújula conecta tus palabras con las herramientas disponibles y te aconseja por dónde empezar.',
    'orientation.landing.latest': 'Revisar la última orientación', 'orientation.landing.open': 'Abrir la Brújula', 'orientation.landing.new': 'Iniciar una nueva orientación',
    'orientation.counselor.step': 'Primera elección', 'orientation.counselor.title': '¿Con qué counselor quieres hablar?', 'orientation.counselor.body': 'Elige primero la voz y el enfoque que te acompañarán. La elección quedará vinculada a esta conversación de la Brújula.',
    'orientation.input.placeholder': 'Escribe qué te trae aquí, una dificultad, una elección o un objetivo…', 'orientation.input.send': 'Enviar a la Brújula',
    'orientation.processing': 'La Brújula está conectando lo que has escrito con las herramientas…',
    'orientation.recommendations.title': 'Herramientas para explorar', 'orientation.recommendations.subtitle': 'Son propuestas orientativas, no evaluaciones. Puedes seguir hablando antes de elegir.',
    'orientation.recommendation.start': 'Explorar esta herramienta', 'orientation.complete': 'Concluir la orientación', 'orientation.completed.title': 'La ruta está lista',
    'orientation.completed.body': 'Puedes abrir una herramienta propuesta y actualizar el cuaderno aquí abajo. La Brújula seguirá disponible.',
    'orientation.continue': 'Continuar al destino anterior', 'orientation.error': 'No se pudo completar esta acción. Inténtalo de nuevo.',
};

const fr: Dict = {
    'nav.orientation': 'Boussole', 'orientation.eyebrow': 'Orientation initiale', 'orientation.title': 'Boussole CounselorBot',
    'orientation.subtitle': 'Expliquez ce que vous souhaitez aborder : la Boussole relie vos mots aux outils disponibles et vous conseille par où commencer.',
    'orientation.landing.latest': 'Revoir la dernière orientation', 'orientation.landing.open': 'Ouvrir la Boussole', 'orientation.landing.new': 'Commencer une nouvelle orientation',
    'orientation.counselor.step': 'Premier choix', 'orientation.counselor.title': 'Avec quel counselor souhaitez-vous parler ?', 'orientation.counselor.body': 'Choisissez d’abord la voix et l’approche qui vous accompagneront. Ce choix restera lié à cette conversation de la Boussole.',
    'orientation.input.placeholder': 'Écrivez ce qui vous amène, une difficulté, un choix ou un objectif…', 'orientation.input.send': 'Envoyer à la Boussole',
    'orientation.processing': 'La Boussole relie votre texte aux outils…',
    'orientation.recommendations.title': 'Outils à explorer', 'orientation.recommendations.subtitle': 'Ce sont des propositions d’orientation, pas des évaluations. Vous pouvez poursuivre le dialogue avant de choisir.',
    'orientation.recommendation.start': 'Explorer cet outil', 'orientation.complete': 'Terminer l’orientation', 'orientation.completed.title': 'La route est prête',
    'orientation.completed.body': 'Ouvrez un outil proposé et mettez à jour votre carnet ci-dessous. La Boussole restera disponible.',
    'orientation.continue': 'Continuer vers la destination précédente', 'orientation.error': 'Impossible de terminer cette action. Réessayez.',
};

const de: Dict = {
    'nav.orientation': 'Kompass', 'orientation.eyebrow': 'Erste Orientierung', 'orientation.title': 'CounselorBot-Kompass',
    'orientation.subtitle': 'Beschreibe dein Anliegen: Der Kompass verbindet deine Worte mit verfügbaren Werkzeugen und rät dir, wo du beginnen kannst.',
    'orientation.landing.latest': 'Letzte Orientierung ansehen', 'orientation.landing.open': 'Kompass öffnen', 'orientation.landing.new': 'Neue Orientierung beginnen',
    'orientation.counselor.step': 'Erste Wahl', 'orientation.counselor.title': 'Mit welchem Counselor möchtest du sprechen?', 'orientation.counselor.body': 'Wähle zuerst die Stimme und den Ansatz, die dich begleiten. Die Wahl bleibt mit diesem Kompass-Gespräch verbunden.',
    'orientation.input.placeholder': 'Schreibe, was dich herführt: Schwierigkeit, Entscheidung oder Ziel…', 'orientation.input.send': 'An den Kompass senden',
    'orientation.processing': 'Der Kompass verbindet deinen Text mit den Werkzeugen…',
    'orientation.recommendations.title': 'Werkzeuge zum Erkunden', 'orientation.recommendations.subtitle': 'Das sind Orientierungsvorschläge, keine Bewertungen. Du kannst vor der Wahl weitersprechen.',
    'orientation.recommendation.start': 'Dieses Werkzeug erkunden', 'orientation.complete': 'Orientierung abschließen', 'orientation.completed.title': 'Die Route ist bereit',
    'orientation.completed.body': 'Öffne ein vorgeschlagenes Werkzeug und aktualisiere unten dein Notizbuch. Der Kompass bleibt verfügbar.',
    'orientation.continue': 'Zum vorherigen Ziel weitergehen', 'orientation.error': 'Diese Aktion konnte nicht abgeschlossen werden. Versuche es erneut.',
};

const sv: Dict = {
    'nav.orientation': 'Kompass', 'orientation.eyebrow': 'Inledande orientering', 'orientation.title': 'CounselorBot-kompassen',
    'orientation.subtitle': 'Berätta vad du vill arbeta med: Kompassen kopplar dina ord till tillgängliga verktyg och råder dig var du kan börja.',
    'orientation.landing.latest': 'Granska senaste orienteringen', 'orientation.landing.open': 'Öppna Kompassen', 'orientation.landing.new': 'Starta en ny orientering',
    'orientation.counselor.step': 'Första valet', 'orientation.counselor.title': 'Vilken counselor vill du prata med?', 'orientation.counselor.body': 'Välj först den röst och det arbetssätt som ska följa dig. Valet kopplas till det här samtalet i Kompassen.',
    'orientation.input.placeholder': 'Skriv vad som tar dig hit, en svårighet, ett val eller ett mål…', 'orientation.input.send': 'Skicka till Kompassen',
    'orientation.processing': 'Kompassen kopplar det du skrev till verktygen…',
    'orientation.recommendations.title': 'Verktyg att utforska', 'orientation.recommendations.subtitle': 'Detta är orienteringsförslag, inte bedömningar. Du kan fortsätta samtalet innan du väljer.',
    'orientation.recommendation.start': 'Utforska verktyget', 'orientation.complete': 'Avsluta orienteringen', 'orientation.completed.title': 'Vägen är klar',
    'orientation.completed.body': 'Öppna ett föreslaget verktyg och uppdatera anteckningsboken nedan. Kompassen finns alltid kvar.',
    'orientation.continue': 'Fortsätt till föregående mål', 'orientation.error': 'Åtgärden kunde inte slutföras. Försök igen.',
};

export const ORIENTATION_DICTS: Record<Lang, Dict> = {
    it: { ...it },
    en: { ...en },
    es: { ...es },
    fr: { ...fr },
    de: { ...de },
    sv: { ...sv },
};
