import type { Lang } from './i18n';

const HELP: Record<Lang, { title: string; local: string; external: string; tools: string }> = {
    "it": {
        "title": "Counselor locali e cloud",
        "local": "Locale: il modello AI elabora le richieste sui server della piattaforma, non sul tuo dispositivo.",
        "external": "Cloud: il modello AI è fornito da un servizio esterno, al quale viene inviato il testo necessario per rispondere.",
        "tools": "La modalità locale o cloud indica dove lavora il modello, non quali strumenti può usare. Per Idea serve un counselor abilitato a Idea: la scelta viene verificata prima di iniziare. Nel Tavolo, da computer, puoi disegnare a mano; per le proposte AI scegli il counselor nel Tavolo. Eventuali modelli di riserva sono indicati lì."
    },
    "en": {
        "title": "Local and cloud counselors",
        "local": "Local: the AI model processes requests on the platform’s servers, not on your device.",
        "external": "Cloud: an external service provides the AI model and receives the text needed to answer.",
        "tools": "Local or cloud describes where the model runs, not which tools it supports. Idea requires a counselor enabled for Idea: your choice is checked before you start. On a computer, you can draw manually in the table; choose the counselor there for AI proposals. Any backup models are indicated there."
    },
    "es": {
        "title": "Counselors locales y en la nube",
        "local": "Local: el modelo de IA procesa las solicitudes en los servidores de la plataforma, no en tu dispositivo.",
        "external": "Nube: un servicio externo proporciona el modelo de IA y recibe el texto necesario para responder.",
        "tools": "Local o nube indica dónde funciona el modelo, no qué herramientas admite. Idea requiere un counselor habilitado para Idea: la elección se comprueba antes de empezar. Desde un ordenador puedes dibujar a mano en el tablero; elige allí el counselor para las propuestas de IA. Los modelos de respaldo se indican allí."
    },
    "fr": {
        "title": "Counselors locaux et cloud",
        "local": "Local : le modèle IA traite les demandes sur les serveurs de la plateforme, pas sur ton appareil.",
        "external": "Cloud : un service externe fournit le modèle IA et reçoit le texte nécessaire pour répondre.",
        "tools": "Local ou cloud indique où fonctionne le modèle, pas quels outils il prend en charge. Idée exige un counselor activé pour Idée : le choix est vérifié avant de commencer. Sur ordinateur, tu peux dessiner à la main dans le tableau ; choisis le counselor sur place pour les propositions IA. Les modèles de secours y sont indiqués."
    },
    "de": {
        "title": "Lokale und Cloud-Counselor",
        "local": "Lokal: Das KI-Modell verarbeitet Anfragen auf den Servern der Plattform, nicht auf deinem Gerät.",
        "external": "Cloud: Ein externer Dienst stellt das KI-Modell bereit und erhält den Text, der für die Antwort nötig ist.",
        "tools": "Lokal oder Cloud beschreibt, wo das Modell läuft, nicht welche Werkzeuge es unterstützt. Idee benötigt einen dafür freigeschalteten Counselor: Die Auswahl wird vor dem Start geprüft. Am Computer kannst du auf dem Tisch von Hand zeichnen; wähle dort den Counselor für KI-Vorschläge. Ersatzmodelle werden dort angezeigt."
    },
    "sv": {
        "title": "Lokala counselor och molncounselor",
        "local": "Lokalt: AI-modellen behandlar förfrågningar på plattformens servrar, inte på din enhet.",
        "external": "Moln: en extern tjänst tillhandahåller AI-modellen och får den text som behövs för att svara.",
        "tools": "Lokalt eller moln beskriver var modellen körs, inte vilka verktyg den stöder. Idé kräver en counselor som är aktiverad för Idé: valet kontrolleras innan du börjar. På en dator kan du rita för hand på bordet; välj counselorn där för AI-förslag. Eventuella reservmodeller visas där."
    }
};

export const counselorHelp = (lang: Lang) => HELP[lang];
