"""Generazione PDF dei risultati questionario (multilingua, senza testo sovrapposto)."""
from io import BytesIO
from datetime import datetime

from fpdf import FPDF

SUPPORTED_LANGS = ("it", "en", "es", "fr", "de", "sv")
DEFAULT_LANG = "it"

# Fattori invertiti (punteggio basso = Forza). I codici non cambiano per lingua.
INVERTED_CODES = {"C3", "C6", "A1", "A4", "A5", "A7", "C4r", "A1r", "T1", "T4"}

# Traduzioni dei fattori di tutti gli strumenti quantitativi:
# FACTOR_TRANS[lang][code] = (nome, descrizione).
# Allineato a frontend/src/lib/i18n-factors.ts (it/en/es/fr/de/sv).
FACTOR_TRANS: dict[str, dict[str, tuple[str, str]]] = {
    "it": {
        "C1": ("Strategie elaborative", "Capacità di elaborare le informazioni"),
        "C2": ("Autoregolazione", "Capacità di regolare il proprio studio"),
        "C3": ("Disorientamento", "Senso di confusione nello studio"),
        "C4": ("Disponibilità alla collaborazione", "Propensione al lavoro di gruppo"),
        "C5": ("Uso di organizzatori semantici", "Uso di mappe e schemi"),
        "C6": ("Difficoltà di concentrazione", "Problemi di attenzione"),
        "C7": ("Autointerrogazione", "Farsi domande durante lo studio"),
        "A1": ("Ansietà di base", "Ansia generale verso lo studio"),
        "A2": ("Volizione", "Forza di volontà"),
        "A3": ("Attribuzione a cause controllabili", "Attribuire successi a sé stessi"),
        "A4": ("Attribuzione a cause incontrollabili", "Attribuire a fortuna/caso"),
        "A5": ("Mancanza di perseveranza", "Tendenza a mollare"),
        "A6": ("Percezione di competenza", "Sentirsi capaci"),
        "A7": ("Interferenze emotive", "Emozioni che disturbano"),
        "C1r": ("Strategie elaborative per comprendere e ricordare", "Elaborazione e collegamento delle informazioni"),
        "C2r": ("Strategie autoregolative", "Organizzazione e controllo del proprio studio"),
        "C3r": ("Strategie grafiche e organizzatori semantici", "Uso di schemi, mappe, grafici e sintesi visive"),
        "C4r": ("Carenza nel controllo dell'attenzione", "Distrazione e difficoltà a mantenere il focus"),
        "A1r": ("Ansietà e controllo delle emozioni", "Interferenza dell'ansia nelle prove scolastiche"),
        "A2r": ("Volizione", "Impegno e perseveranza nello studio"),
        "A3r": ("Attribuzioni causali", "Lettura delle cause di successo e insuccesso"),
        "A4r": ("Percezione di competenza", "Fiducia nelle proprie capacità di riuscire"),
        "T1": ("Passato Negativo", "Ricordi negativi e rimpianti legati al passato"),
        "T2": ("Passato Positivo", "Visione calda e nostalgica del passato"),
        "T3": ("Presente Edonistico", "Capacità di vivere l'attimo (carpe diem), orientamento al piacere nel presente"),
        "T4": ("Presente Fatalistico", "Senso di impotenza e rassegnazione verso la vita"),
        "T5": ("Futuro", "Orientamento verso obiettivi, pianificazione e carriera"),
        "S1": ("Gestione delle emozioni", "Gestire ansia e tensione nello studio"),
        "S2": ("Competenza comunicativa", "Comunicare e relazionarsi con gli altri"),
        "S3": ("Volontà e perseveranza", "Portare a termine con impegno"),
        "S4": ("Strategie e collaborazione", "Strategie di apprendimento e lavoro con altri"),
        "S5": ("Fiducia e progetto di vita", "Fiducia nelle competenze e senso di progetto"),
        "K1": ("Comunicazione in pubblico", "Parlare e convincere davanti ad altri"),
        "K2": ("Gestione di ansia e responsabilità", "Gestire pressione e responsabilità nelle decisioni"),
        "K3": ("Volizione e autoregolazione", "Organizzare il lavoro e portarlo a termine"),
        "K4": ("Strategie di elaborazione", "Collegare e applicare ciò che si apprende"),
        "K5": ("Convinzioni su di sé", "Fiducia, attribuzioni e motivazione a riuscire"),
        "AD1": ("Orientamento al futuro", "Pensare e prepararsi al proprio futuro"),
        "AD2": ("Controllo e autonomia", "Decidere e assumersi la responsabilità delle scelte"),
        "AD3": ("Curiosità ed esplorazione", "Esplorare opzioni e opportunità"),
        "AD4": ("Fiducia e problem solving", "Affrontare e risolvere i problemi"),
    },
    "en": {
        "C1": ("Elaborative strategies", "Ability to process information"),
        "C2": ("Self-regulation", "Ability to regulate one's own study"),
        "C3": ("Disorientation", "Sense of confusion while studying"),
        "C4": ("Willingness to collaborate", "Inclination towards group work"),
        "C5": ("Use of semantic organisers", "Use of maps and diagrams"),
        "C6": ("Concentration difficulties", "Attention problems"),
        "C7": ("Self-questioning", "Asking oneself questions while studying"),
        "A1": ("Baseline anxiety", "General anxiety towards study"),
        "A2": ("Volition", "Willpower"),
        "A3": ("Attribution to controllable causes", "Attributing success to oneself"),
        "A4": ("Attribution to uncontrollable causes", "Attributing to luck/chance"),
        "A5": ("Lack of perseverance", "Tendency to give up"),
        "A6": ("Perceived competence", "Feeling capable"),
        "A7": ("Emotional interference", "Disturbing emotions"),
        "C1r": ("Elaborative strategies for understanding and remembering", "Processing and connecting information"),
        "C2r": ("Self-regulated strategies", "Organising and regulating one's study"),
        "C3r": ("Graphic strategies and semantic organisers", "Use of diagrams, maps, graphs and visual summaries"),
        "C4r": ("Lack of attention control", "Distraction and difficulty maintaining focus"),
        "A1r": ("Anxiety and emotional control", "Interference from anxiety during school assessments"),
        "A2r": ("Volition", "Effort and perseverance in studying"),
        "A3r": ("Causal attributions", "Understanding the causes of success and failure"),
        "A4r": ("Perceived competence", "Confidence in one's ability to succeed"),
        "T1": ("Past Negative", "Negative memories and regrets about the past"),
        "T2": ("Past Positive", "Warm, nostalgic view of the past"),
        "T3": ("Present Hedonistic", "Ability to live in the moment (carpe diem), orientation towards pleasure in the present"),
        "T4": ("Present Fatalistic", "Sense of helplessness and resignation towards life"),
        "T5": ("Future", "Orientation towards goals, planning and career"),
        "S1": ("Managing emotions", "Handling anxiety and tension in study"),
        "S2": ("Communicative competence", "Communicating and relating to others"),
        "S3": ("Will & perseverance", "Following through with commitment"),
        "S4": ("Strategies & collaboration", "Learning strategies and working with others"),
        "S5": ("Confidence & life project", "Confidence in one's skills and sense of purpose"),
        "K1": ("Public speaking", "Speaking and persuading in front of others"),
        "K2": ("Managing anxiety & responsibility", "Handling pressure and responsibility in decisions"),
        "K3": ("Volition & self-regulation", "Organising work and seeing it through"),
        "K4": ("Elaboration strategies", "Connecting and applying what one learns"),
        "K5": ("Beliefs about oneself", "Confidence, attributions and motivation to succeed"),
        "AD1": ("Future orientation", "Thinking about and preparing for one's future"),
        "AD2": ("Control & autonomy", "Deciding and taking responsibility for choices"),
        "AD3": ("Curiosity & exploration", "Exploring options and opportunities"),
        "AD4": ("Confidence & problem solving", "Facing and solving problems"),
    },
    "es": {
        "C1": ("Estrategias elaborativas", "Capacidad de procesar la información"),
        "C2": ("Autorregulación", "Capacidad de regular el propio estudio"),
        "C3": ("Desorientación", "Sensación de confusión al estudiar"),
        "C4": ("Disposición a colaborar", "Inclinación al trabajo en grupo"),
        "C5": ("Uso de organizadores semánticos", "Uso de mapas y esquemas"),
        "C6": ("Dificultades de concentración", "Problemas de atención"),
        "C7": ("Autointerrogación", "Hacerse preguntas mientras se estudia"),
        "A1": ("Ansiedad de base", "Ansiedad general hacia el estudio"),
        "A2": ("Volición", "Fuerza de voluntad"),
        "A3": ("Atribución a causas controlables", "Atribuir los éxitos a uno mismo"),
        "A4": ("Atribución a causas incontrolables", "Atribuir a la suerte/al azar"),
        "A5": ("Falta de perseverancia", "Tendencia a abandonar"),
        "A6": ("Percepción de competencia", "Sentirse capaz"),
        "A7": ("Interferencias emocionales", "Emociones que perturban"),
        "C1r": ("Estrategias elaborativas para comprender y recordar", "Elaboración y conexión de la información"),
        "C2r": ("Estrategias autorregulativas", "Organización y control del propio estudio"),
        "C3r": ("Estrategias gráficas y organizadores semánticos", "Uso de esquemas, mapas, gráficos y síntesis visuales"),
        "C4r": ("Falta de control de la atención", "Distracción y dificultad para mantener la concentración"),
        "A1r": ("Ansiedad y control de las emociones", "Interferencia de la ansiedad en las pruebas escolares"),
        "A2r": ("Volición", "Esfuerzo y perseverancia en el estudio"),
        "A3r": ("Atribuciones causales", "Lectura de las causas del éxito y del fracaso"),
        "A4r": ("Percepción de competencia", "Confianza en la propia capacidad de éxito"),
        "T1": ("Pasado Negativo", "Recuerdos negativos y arrepentimientos del pasado"),
        "T2": ("Pasado Positivo", "Visión cálida y nostálgica del pasado"),
        "T3": ("Presente Hedonista", "Capacidad de vivir el momento (carpe diem), orientación al placer en el presente"),
        "T4": ("Presente Fatalista", "Sensación de impotencia y resignación ante la vida"),
        "T5": ("Futuro", "Orientación hacia objetivos, planificación y carrera"),
        "S1": ("Gestión de las emociones", "Gestionar la ansiedad y la tensión en el estudio"),
        "S2": ("Competencia comunicativa", "Comunicarse y relacionarse con los demás"),
        "S3": ("Voluntad y perseverancia", "Llevar las tareas a término con compromiso"),
        "S4": ("Estrategias y colaboración", "Estrategias de aprendizaje y trabajo con los demás"),
        "S5": ("Confianza y proyecto de vida", "Confianza en las propias competencias y sentido de proyecto"),
        "K1": ("Comunicación en público", "Hablar y convencer ante otras personas"),
        "K2": ("Gestión de la ansiedad y la responsabilidad", "Gestionar la presión y la responsabilidad en las decisiones"),
        "K3": ("Volición y autorregulación", "Organizar el trabajo y llevarlo a término"),
        "K4": ("Estrategias de elaboración", "Relacionar y aplicar lo que se aprende"),
        "K5": ("Creencias sobre uno mismo", "Confianza, atribuciones y motivación para tener éxito"),
        "AD1": ("Orientación al futuro", "Pensar y prepararse para el propio futuro"),
        "AD2": ("Control y autonomía", "Decidir y asumir la responsabilidad de las decisiones"),
        "AD3": ("Curiosidad y exploración", "Explorar opciones y oportunidades"),
        "AD4": ("Confianza y resolución de problemas", "Afrontar y resolver problemas"),
    },
    "fr": {
        "C1": ("Stratégies d'élaboration", "Capacité à traiter l'information"),
        "C2": ("Autorégulation", "Capacité à réguler son propre travail"),
        "C3": ("Désorientation", "Sentiment de confusion pendant les études"),
        "C4": ("Disposition à collaborer", "Propension au travail de groupe"),
        "C5": ("Usage d'organisateurs sémantiques", "Usage de cartes et de schémas"),
        "C6": ("Difficultés de concentration", "Problèmes d'attention"),
        "C7": ("Auto-questionnement", "Se poser des questions en étudiant"),
        "A1": ("Anxiété de base", "Anxiété générale envers les études"),
        "A2": ("Volition", "Force de volonté"),
        "A3": ("Attribution à des causes contrôlables", "Attribuer les réussites à soi-même"),
        "A4": ("Attribution à des causes incontrôlables", "Attribuer à la chance/au hasard"),
        "A5": ("Manque de persévérance", "Tendance à abandonner"),
        "A6": ("Perception de compétence", "Se sentir capable"),
        "A7": ("Interférences émotionnelles", "Émotions perturbatrices"),
        "C1r": ("Stratégies élaboratives pour comprendre et mémoriser", "Élaboration et mise en relation des informations"),
        "C2r": ("Stratégies autorégulées", "Organisation et contrôle de son travail"),
        "C3r": ("Stratégies graphiques et organisateurs sémantiques", "Usage de schémas, cartes, graphiques et synthèses visuelles"),
        "C4r": ("Manque de contrôle de l'attention", "Distraction et difficulté à maintenir l'attention"),
        "A1r": ("Anxiété et contrôle des émotions", "Interférence de l'anxiété lors des évaluations scolaires"),
        "A2r": ("Volition", "Effort et persévérance dans les études"),
        "A3r": ("Attributions causales", "Interprétation des causes de réussite et d'échec"),
        "A4r": ("Perception de compétence", "Confiance en sa capacité à réussir"),
        "T1": ("Passé Négatif", "Souvenirs négatifs et regrets liés au passé"),
        "T2": ("Passé Positif", "Vision chaleureuse et nostalgique du passé"),
        "T3": ("Présent Hédoniste", "Capacité à vivre l'instant (carpe diem), orientation vers le plaisir au présent"),
        "T4": ("Présent Fataliste", "Sentiment d'impuissance et de résignation face à la vie"),
        "T5": ("Futur", "Orientation vers les objectifs, la planification et la carrière"),
        "S1": ("Gestion des émotions", "Gérer l'anxiété et la tension dans les études"),
        "S2": ("Compétence communicationnelle", "Communiquer et entrer en relation avec les autres"),
        "S3": ("Volonté et persévérance", "Mener les tâches à terme avec engagement"),
        "S4": ("Stratégies et collaboration", "Stratégies d'apprentissage et travail avec les autres"),
        "S5": ("Confiance et projet de vie", "Confiance dans ses compétences et sens du projet"),
        "K1": ("Communication en public", "Parler et convaincre devant les autres"),
        "K2": ("Gestion de l'anxiété et de la responsabilité", "Gérer la pression et la responsabilité dans les décisions"),
        "K3": ("Volition et autorégulation", "Organiser son travail et le mener à terme"),
        "K4": ("Stratégies d'élaboration", "Mettre en relation et appliquer ce que l'on apprend"),
        "K5": ("Croyances sur soi", "Confiance, attributions et motivation à réussir"),
        "AD1": ("Orientation vers l'avenir", "Penser à son avenir et s'y préparer"),
        "AD2": ("Contrôle et autonomie", "Décider et assumer la responsabilité de ses choix"),
        "AD3": ("Curiosité et exploration", "Explorer les options et les opportunités"),
        "AD4": ("Confiance et résolution de problèmes", "Affronter et résoudre les problèmes"),
    },
    "de": {
        "C1": ("Elaborationsstrategien", "Fähigkeit, Informationen zu verarbeiten"),
        "C2": ("Selbstregulation", "Fähigkeit, das eigene Lernen zu steuern"),
        "C3": ("Desorientierung", "Gefühl der Verwirrung beim Lernen"),
        "C4": ("Kooperationsbereitschaft", "Neigung zur Gruppenarbeit"),
        "C5": ("Verwendung semantischer Organisatoren", "Verwendung von Karten und Diagrammen"),
        "C6": ("Konzentrationsschwierigkeiten", "Aufmerksamkeitsprobleme"),
        "C7": ("Selbstbefragung", "Sich beim Lernen Fragen stellen"),
        "A1": ("Grundangst", "Allgemeine Angst vor dem Lernen"),
        "A2": ("Volition", "Willenskraft"),
        "A3": ("Attribution auf kontrollierbare Ursachen", "Erfolge sich selbst zuschreiben"),
        "A4": ("Attribution auf unkontrollierbare Ursachen", "Dem Glück/Zufall zuschreiben"),
        "A5": ("Mangelnde Ausdauer", "Neigung aufzugeben"),
        "A6": ("Kompetenzwahrnehmung", "Sich fähig fühlen"),
        "A7": ("Emotionale Interferenzen", "Störende Emotionen"),
        "C1r": ("Elaborative Strategien zum Verstehen und Erinnern", "Verarbeitung und Verknuepfung von Informationen"),
        "C2r": ("Selbstregulative Strategien", "Organisation und Steuerung des eigenen Lernens"),
        "C3r": ("Grafische Strategien und semantische Organisatoren", "Nutzung von Schemata, Karten, Grafiken und visuellen Zusammenfassungen"),
        "C4r": ("Mangelnde Aufmerksamkeitssteuerung", "Ablenkung und Schwierigkeiten, konzentriert zu bleiben"),
        "A1r": ("Angst und Emotionskontrolle", "Beeintraechtigung durch Angst bei schulischen Pruefungen"),
        "A2r": ("Volition", "Anstrengung und Ausdauer beim Lernen"),
        "A3r": ("Kausale Attributionen", "Einordnung der Ursachen von Erfolg und Misserfolg"),
        "A4r": ("Kompetenzwahrnehmung", "Vertrauen in die eigene Erfolgsfaehigkeit"),
        "T1": ("Negative Vergangenheit", "Negative Erinnerungen und Bedauern über die Vergangenheit"),
        "T2": ("Positive Vergangenheit", "Warme, nostalgische Sicht auf die Vergangenheit"),
        "T3": ("Hedonistische Gegenwart", "Fähigkeit, den Moment zu leben (carpe diem), Orientierung am Genuss in der Gegenwart"),
        "T4": ("Fatalistische Gegenwart", "Gefühl der Hilflosigkeit und Resignation gegenüber dem Leben"),
        "T5": ("Zukunft", "Orientierung an Zielen, Planung und Karriere"),
        "S1": ("Emotionsmanagement", "Angst und Anspannung beim Lernen bewältigen"),
        "S2": ("Kommunikative Kompetenz", "Mit anderen kommunizieren und Beziehungen gestalten"),
        "S3": ("Wille und Ausdauer", "Aufgaben engagiert zu Ende führen"),
        "S4": ("Strategien und Zusammenarbeit", "Lernstrategien und Zusammenarbeit mit anderen"),
        "S5": ("Vertrauen und Lebensentwurf", "Vertrauen in die eigenen Kompetenzen und Sinn für Lebensplanung"),
        "K1": ("Sprechen vor Publikum", "Vor anderen sprechen und überzeugen"),
        "K2": ("Umgang mit Angst und Verantwortung", "Druck und Verantwortung bei Entscheidungen bewältigen"),
        "K3": ("Volition und Selbstregulation", "Arbeit organisieren und zu Ende führen"),
        "K4": ("Elaborationsstrategien", "Gelerntes verknüpfen und anwenden"),
        "K5": ("Überzeugungen über sich selbst", "Selbstvertrauen, Attributionen und Erfolgsmotivation"),
        "AD1": ("Zukunftsorientierung", "An die eigene Zukunft denken und sich darauf vorbereiten"),
        "AD2": ("Kontrolle und Autonomie", "Entscheiden und Verantwortung für Entscheidungen übernehmen"),
        "AD3": ("Neugier und Erkundung", "Optionen und Möglichkeiten erkunden"),
        "AD4": ("Vertrauen und Problemlösung", "Probleme angehen und lösen"),
    },
    "sv": {
        "C1": ("Bearbetningsstrategier", "Förmåga att bearbeta information"),
        "C2": ("Självreglering", "Förmåga att reglera sina egna studier"),
        "C3": ("Desorientering", "Känsla av förvirring under studierna"),
        "C4": ("Samarbetsvilja", "Benägenhet för grupparbete"),
        "C5": ("Användning av semantiska organisatörer", "Användning av kartor och scheman"),
        "C6": ("Koncentrationssvårigheter", "Uppmärksamhetsproblem"),
        "C7": ("Självfrågande", "Att ställa frågor till sig själv under studierna"),
        "A1": ("Grundångest", "Allmän ångest inför studierna"),
        "A2": ("Vilja", "Viljestyrka"),
        "A3": ("Attribution till kontrollerbara orsaker", "Att tillskriva sig själv framgångar"),
        "A4": ("Attribution till okontrollerbara orsaker", "Att tillskriva tur/slump"),
        "A5": ("Brist på uthållighet", "Tendens att ge upp"),
        "A6": ("Upplevd kompetens", "Att känna sig kapabel"),
        "A7": ("Emotionella störningar", "Störande känslor"),
        "C1r": ("Bearbetningsstrategier för förståelse och minne", "Bearbetning och koppling av information"),
        "C2r": ("Självreglerande strategier", "Organisering och styrning av de egna studierna"),
        "C3r": ("Grafiska strategier och semantiska organisatörer", "Användning av scheman, kartor, diagram och visuella sammanfattningar"),
        "C4r": ("Bristande kontroll över uppmärksamheten", "Distraktion och svårighet att behålla fokus"),
        "A1r": ("Ångest och kontroll av känslor", "Ångestens påverkan vid skolprov"),
        "A2r": ("Vilja", "Ansträngning och uthållighet i studierna"),
        "A3r": ("Orsaksförklaringar", "Tolkning av orsaker till framgång och misslyckande"),
        "A4r": ("Upplevd kompetens", "Tilltro till den egna förmågan att lyckas"),
        "T1": ("Negativt Förflutet", "Negativa minnen och ånger kopplade till det förflutna"),
        "T2": ("Positivt Förflutet", "Varm och nostalgisk syn på det förflutna"),
        "T3": ("Hedonistisk Nutid", "Förmåga att leva i nuet (carpe diem), inriktning på njutning i nuet"),
        "T4": ("Fatalistisk Nutid", "Känsla av maktlöshet och uppgivenhet inför livet"),
        "T5": ("Framtid", "Inriktning mot mål, planering och karriär"),
        "S1": ("Hantera känslor", "Hantera ångest och spänning i studierna"),
        "S2": ("Kommunikativ kompetens", "Kommunicera och relatera till andra"),
        "S3": ("Vilja & uthållighet", "Slutföra med engagemang"),
        "S4": ("Strategier & samarbete", "Inlärningsstrategier och samarbete med andra"),
        "S5": ("Tilltro & livsprojekt", "Tilltro till sina förmågor och känsla av mål"),
        "K1": ("Tala inför andra", "Tala och övertyga inför andra"),
        "K2": ("Hantera ångest & ansvar", "Hantera press och ansvar i beslut"),
        "K3": ("Vilja & självreglering", "Organisera arbetet och slutföra det"),
        "K4": ("Bearbetningsstrategier", "Koppla samman och tillämpa det man lär sig"),
        "K5": ("Föreställningar om sig själv", "Tilltro, attributioner och motivation att lyckas"),
        "AD1": ("Framtidsorientering", "Tänka på och förbereda sin framtid"),
        "AD2": ("Kontroll & självständighet", "Besluta och ta ansvar för val"),
        "AD3": ("Nyfikenhet & utforskande", "Utforska alternativ och möjligheter"),
        "AD4": ("Tilltro & problemlösning", "Möta och lösa problem"),
    },
}

# Stringhe fisse dell'interfaccia PDF per lingua.
UI_TEXT: dict[str, dict[str, str]] = {
    "it": {
        "title": "CounselorBot - Risultati Questionario",
        "type": "Tipo", "date": "Data", "session": "ID Sessione",
        "by_factor": "Punteggi per fattore:", "scores": "Punteggi:",
        "legend": "Legenda:", "strength": "Forza", "normal": "Nella Norma",
        "growth": "Area di Crescita",
        "inverted_note": "Nota: per alcuni fattori il punteggio e' invertito (punteggio basso = Forza).",
        "savickas_1": "Questo e' un questionario qualitativo (Savickas). I risultati sono disponibili nella trascrizione della chat.",
        "savickas_2": "Il percorso narrativo della Career Construction Interview non produce punteggi numerici.",
        "page": "Pagina",
    },
    "en": {
        "title": "CounselorBot - Questionnaire Results",
        "type": "Type", "date": "Date", "session": "Session ID",
        "by_factor": "Scores by factor:", "scores": "Scores:",
        "legend": "Legend:", "strength": "Strength", "normal": "Within Norm",
        "growth": "Area for Growth",
        "inverted_note": "Note: for some factors the score is inverted (low score = Strength).",
        "savickas_1": "This is a qualitative questionnaire (Savickas). The results are available in the chat transcript.",
        "savickas_2": "The narrative path of the Career Construction Interview does not produce numerical scores.",
        "page": "Page",
    },
    "es": {
        "title": "CounselorBot - Resultados del Cuestionario",
        "type": "Tipo", "date": "Fecha", "session": "ID de Sesión",
        "by_factor": "Puntuaciones por factor:", "scores": "Puntuaciones:",
        "legend": "Leyenda:", "strength": "Fortaleza", "normal": "Dentro de la Norma",
        "growth": "Área de Mejora",
        "inverted_note": "Nota: en algunos factores la puntuación está invertida (puntuación baja = Fortaleza).",
        "savickas_1": "Este es un cuestionario cualitativo (Savickas). Los resultados están disponibles en la transcripción del chat.",
        "savickas_2": "El recorrido narrativo de la Career Construction Interview no produce puntuaciones numéricas.",
        "page": "Página",
    },
    "fr": {
        "title": "CounselorBot - Résultats du Questionnaire",
        "type": "Type", "date": "Date", "session": "ID de Session",
        "by_factor": "Scores par facteur :", "scores": "Scores :",
        "legend": "Légende :", "strength": "Force", "normal": "Dans la Norme",
        "growth": "Axe de Progrès",
        "inverted_note": "Note : pour certains facteurs le score est inversé (score bas = Force).",
        "savickas_1": "Ceci est un questionnaire qualitatif (Savickas). Les résultats sont disponibles dans la transcription du chat.",
        "savickas_2": "Le parcours narratif de la Career Construction Interview ne produit pas de scores numériques.",
        "page": "Page",
    },
    "de": {
        "title": "CounselorBot - Fragebogen-Ergebnisse",
        "type": "Typ", "date": "Datum", "session": "Sitzungs-ID",
        "by_factor": "Werte pro Faktor:", "scores": "Werte:",
        "legend": "Legende:", "strength": "Stärke", "normal": "Im Normbereich",
        "growth": "Entwicklungsbereich",
        "inverted_note": "Hinweis: Bei einigen Faktoren ist der Wert invertiert (niedriger Wert = Stärke).",
        "savickas_1": "Dies ist ein qualitativer Fragebogen (Savickas). Die Ergebnisse sind im Chat-Verlauf verfügbar.",
        "savickas_2": "Der narrative Verlauf des Career Construction Interview liefert keine numerischen Werte.",
        "page": "Seite",
    },
    "sv": {
        "title": "CounselorBot - Frågeformulärsresultat",
        "type": "Typ", "date": "Datum", "session": "Sessions-ID",
        "by_factor": "Poäng per faktor:", "scores": "Poäng:",
        "legend": "Förklaring:", "strength": "Styrka", "normal": "Inom Normen",
        "growth": "Utvecklingsområde",
        "inverted_note": "Obs: för vissa faktorer är poängen inverterad (låg poäng = Styrka).",
        "savickas_1": "Detta är ett kvalitativt frågeformulär (Savickas). Resultaten finns i chattutskriften.",
        "savickas_2": "Den narrativa vägen i Career Construction Interview ger inga numeriska poäng.",
        "page": "Sida",
    },
}


def _normalize_lang(language: str | None) -> str:
    if not language:
        return DEFAULT_LANG
    code = language.split("-")[0].lower()
    return code if code in SUPPORTED_LANGS else DEFAULT_LANG


def _latin1(text: str) -> str:
    """I font core fpdf usano latin-1: sostituisci i caratteri non rappresentabili."""
    return text.encode("latin-1", "replace").decode("latin-1")


class ResultPDF(FPDF):
    def __init__(self, title: str, page_label: str):
        super().__init__()
        self._title = title
        self._page_label = page_label

    def header(self):
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(25, 25, 30)
        self.cell(0, 10, _latin1(self._title), new_x="LMARGIN", new_y="NEXT", align="C")
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 130)
        self.cell(0, 10, f"{self._page_label} {self.page_no()}/{{nb}}", align="C")


def _score_label(value: int, inverted: bool, ui: dict[str, str]) -> tuple[str, tuple[int, int, int]]:
    """Restituisce (etichetta tradotta, colore RGB) per un punteggio."""
    if inverted:
        if value <= 3:
            return (ui["strength"], (34, 197, 94))
        elif value >= 7:
            return (ui["growth"], (239, 68, 68))
        return (ui["normal"], (234, 179, 8))
    if value >= 7:
        return (ui["strength"], (34, 197, 94))
    elif value <= 3:
        return (ui["growth"], (239, 68, 68))
    return (ui["normal"], (234, 179, 8))


def generate_questionnaire_pdf(
    questionnaire_type: str,
    scores: dict[str, int | float] | None,
    session_id: str,
    submitted_at: str | None = None,
    language: str | None = None,
) -> BytesIO:
    """Genera un PDF dei risultati nella lingua selezionata, restituisce BytesIO.

    Il layout usa multi_cell a piena larghezza per nomi e descrizioni dei fattori:
    il testo va a capo invece di sovrapporsi alle celle adiacenti.
    """
    lang = _normalize_lang(language)
    ui = UI_TEXT[lang]
    trans = FACTOR_TRANS[lang]

    pdf = ResultPDF(title=ui["title"], page_label=ui["page"])
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    content_w = pdf.w - pdf.l_margin - pdf.r_margin

    # Sottointestazione
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(80, 80, 90)
    pdf.cell(0, 7, _latin1(f"{ui['type']}: {questionnaire_type}"), new_x="LMARGIN", new_y="NEXT")
    if submitted_at:
        try:
            dt = datetime.fromisoformat(submitted_at)
            pdf.cell(0, 7, _latin1(f"{ui['date']}: {dt.strftime('%d/%m/%Y %H:%M')}"), new_x="LMARGIN", new_y="NEXT")
        except (ValueError, TypeError):
            pass
    pdf.cell(0, 7, _latin1(f"{ui['session']}: {session_id[:16]}..."), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    has_inverted = False

    if questionnaire_type == "SAVICKAS":
        pdf.set_font("Helvetica", "", 12)
        pdf.set_text_color(100, 100, 110)
        pdf.multi_cell(content_w, 7, _latin1(ui["savickas_1"]), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
        pdf.set_font("Helvetica", "I", 10)
        pdf.set_text_color(60, 60, 70)
        pdf.multi_cell(content_w, 6, _latin1(ui["savickas_2"]), new_x="LMARGIN", new_y="NEXT")
    elif scores:
        has_factor_info = any(code in trans for code in scores)

        if has_factor_info:
            pdf.set_font("Helvetica", "B", 12)
            pdf.set_text_color(25, 25, 30)
            pdf.cell(0, 8, _latin1(ui["by_factor"]), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)

            for code, value in scores.items():
                value_int = int(round(float(value)))
                info = trans.get(code)
                if not info:
                    # Codice senza traduzione: riga semplice, niente sovrapposizione.
                    pdf.set_font("Helvetica", "", 10)
                    pdf.set_text_color(25, 25, 30)
                    pdf.cell(0, 7, _latin1(f"{code}: {value_int}/9"), new_x="LMARGIN", new_y="NEXT")
                    continue

                name, desc = info
                inverted = code in INVERTED_CODES
                has_inverted = has_inverted or inverted
                label, color = _score_label(value_int, inverted, ui)

                # Riga 1: codice + nome a piena larghezza (va a capo, non si sovrappone)
                pdf.set_font("Helvetica", "B", 11)
                pdf.set_text_color(25, 25, 30)
                pdf.multi_cell(content_w, 6, _latin1(f"{code} - {name}"), new_x="LMARGIN", new_y="NEXT")

                # Riga 2: valore + etichetta colorata, rientrata
                pdf.set_x(pdf.l_margin + 4)
                pdf.set_font("Helvetica", "B", 10)
                pdf.set_text_color(*color)
                pdf.cell(0, 6, _latin1(f"{value_int}/9   [{label}]"), new_x="LMARGIN", new_y="NEXT")

                # Riga 3: descrizione, rientrata e a capo automatico
                pdf.set_x(pdf.l_margin + 4)
                pdf.set_font("Helvetica", "I", 8)
                pdf.set_text_color(110, 110, 120)
                pdf.multi_cell(content_w - 4, 5, _latin1(desc), new_x="LMARGIN", new_y="NEXT")
                pdf.ln(3)
        else:
            pdf.set_font("Helvetica", "", 11)
            pdf.set_text_color(80, 80, 90)
            pdf.cell(0, 8, _latin1(ui["scores"]), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)
            for code, value in scores.items():
                value_int = int(round(float(value)))
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(25, 25, 30)
                pdf.cell(0, 7, _latin1(f"{code}: {value_int}/9"), new_x="LMARGIN", new_y="NEXT")

    # Legenda
    pdf.ln(6)
    pdf.set_draw_color(200, 200, 210)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(80, 80, 90)
    pdf.cell(0, 6, _latin1(ui["legend"]), new_x="LMARGIN", new_y="NEXT")

    legend_items = [
        (ui["strength"], (34, 197, 94)),
        (ui["normal"], (234, 179, 8)),
        (ui["growth"], (239, 68, 68)),
    ]
    for leg_label, leg_color in legend_items:
        pdf.set_fill_color(*leg_color)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(60, 60, 70)
        pdf.cell(6, 5, "", fill=True)
        pdf.cell(2, 5, "")
        pdf.cell(0, 5, _latin1(leg_label), new_x="LMARGIN", new_y="NEXT")

    # Nota fattori invertiti
    if has_inverted:
        pdf.ln(2)
        pdf.set_font("Helvetica", "I", 7)
        pdf.set_text_color(140, 140, 150)
        pdf.multi_cell(content_w, 4, _latin1(ui["inverted_note"]), new_x="LMARGIN", new_y="NEXT")

    pdf_bytes = BytesIO()
    pdf.output(pdf_bytes)
    pdf_bytes.seek(0)
    return pdf_bytes


BOOKLET_LABELS = {
    "strength": "Punti di forza da valorizzare",
    "growth_area": "Aree da migliorare",
    "motivation": "Perche' e' importante per me",
    "objective": "Obiettivo",
    "strategy": "Strategia concreta",
    "period": "Periodo",
    "commitment": "Impegno rispettato",
    "difficulties": "Difficolta' incontrate",
    "improvements": "Miglioramenti osservati",
    "discovery": "Cosa ho scoperto",
    "bio_date": "Data biografia",
    "bio_context": "In occasione di",
    "bio_discovery": "Ho scoperto che",
    "bio_keywords": "Parole chiave",
    "student_notes": "Note dello studente",
    "final_satisfaction": "Valutazione finale",
    "final_observations": "Osservazioni finali",
}

BOOKLET_FACTOR_CODES = {
    "QSA": ("C1", "C2", "C3", "C4", "C5", "C6", "C7", "A1", "A2", "A3", "A4", "A5", "A6", "A7"),
    "QSAr": ("C1r", "C2r", "C3r", "C4r", "A1r", "A2r", "A3r", "A4r"),
    "ZTPI": ("T1", "T2", "T3", "T4", "T5"),
    "QPCS": ("S1", "S2", "S3", "S4", "S5"),
    "QPCC": ("K1", "K2", "K3", "K4", "K5"),
    "QAP": ("AD1", "AD2", "AD3", "AD4"),
}


def _booklet_text(data: dict, key: str) -> str:
    value = data.get(key)
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


def _booklet_text_list(data: dict, key: str) -> list[str]:
    value = data.get(key)
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    return [text] if text else []


def _booklet_field(pdf: FPDF, label: str, value: str, content_w: float) -> None:
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(70, 70, 80)
    pdf.multi_cell(content_w, 5, _latin1(label), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(25, 25, 30)
    pdf.multi_cell(content_w, 6, _latin1(value or "________________________________________"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)


def _booklet_multi_field(pdf: FPDF, label: str, values: list[str], content_w: float) -> None:
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(70, 70, 80)
    pdf.multi_cell(content_w, 5, _latin1(label), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(25, 25, 30)
    if not values:
        pdf.multi_cell(content_w, 6, _latin1("________________________________________"), new_x="LMARGIN", new_y="NEXT")
    for item in values:
        pdf.multi_cell(content_w, 6, _latin1(f"- {item}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)


def _booklet_section(pdf: FPDF, title: str, content_w: float) -> None:
    pdf.ln(3)
    pdf.set_fill_color(238, 242, 255)
    pdf.set_text_color(49, 46, 129)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(content_w, 8, _latin1(title), new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.ln(2)


def generate_student_booklet_pdf(
    questionnaire_type: str,
    scores: dict[str, int | float] | None,
    session_id: str | None,
    booklet_data: dict | None,
    username: str,
    submitted_at: str | None = None,
    language: str | None = None,
) -> BytesIO:
    """Genera il libretto compilato dallo studente per una compilazione."""
    lang = _normalize_lang(language)
    ui = UI_TEXT[lang]
    trans = FACTOR_TRANS[lang]
    data = booklet_data or {}

    pdf = ResultPDF(title="CounselorBot - Libretto dello studente", page_label=ui["page"])
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    content_w = pdf.w - pdf.l_margin - pdf.r_margin

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(80, 80, 90)
    pdf.cell(0, 7, _latin1(f"{ui['type']}: {questionnaire_type}"), new_x="LMARGIN", new_y="NEXT")
    if submitted_at:
        try:
            dt = datetime.fromisoformat(submitted_at)
            pdf.cell(0, 7, _latin1(f"{ui['date']}: {dt.strftime('%d/%m/%Y %H:%M')}"), new_x="LMARGIN", new_y="NEXT")
        except (ValueError, TypeError):
            pass
    if session_id:
        pdf.cell(0, 7, _latin1(f"{ui['session']}: {session_id[:16]}..."), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 7, _latin1(f"Account: {username}"), new_x="LMARGIN", new_y="NEXT")
    title = _booklet_text(data, "title")
    if title:
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(49, 46, 129)
        pdf.multi_cell(content_w, 8, _latin1(title), new_x="LMARGIN", new_y="NEXT")

    _booklet_section(pdf, "1. Profilo di riferimento", content_w)
    if questionnaire_type == "SAVICKAS":
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(70, 70, 80)
        pdf.multi_cell(
            content_w,
            6,
            _latin1("Percorso narrativo qualitativo: usa il libretto per collegare temi emersi, obiettivi e prossimi passi."),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(2)
    elif scores:
        for code, raw_value in scores.items():
            try:
                value_int = int(round(float(raw_value)))
            except (TypeError, ValueError):
                continue
            info = trans.get(code)
            name = info[0] if info else code
            label, color = _score_label(value_int, code in INVERTED_CODES, ui)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(25, 25, 30)
            pdf.multi_cell(content_w, 5, _latin1(f"{code} - {name}"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(*color)
            pdf.cell(0, 5, _latin1(f"{value_int}/9 [{label}]"), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
    elif questionnaire_type in BOOKLET_FACTOR_CODES:
        for code in BOOKLET_FACTOR_CODES[questionnaire_type]:
            info = trans.get(code)
            name = info[0] if info else code
            desc = info[1] if info and len(info) > 1 else ""
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(25, 25, 30)
            pdf.multi_cell(content_w, 5, _latin1(f"{code} - {name}"), new_x="LMARGIN", new_y="NEXT")
            if desc:
                pdf.set_font("Helvetica", "", 8)
                pdf.set_text_color(80, 80, 90)
                pdf.multi_cell(content_w, 5, _latin1(desc), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(70, 70, 80)
        pdf.multi_cell(content_w, 6, _latin1("Nessuna area predefinita disponibile per questo strumento."), new_x="LMARGIN", new_y="NEXT")

    _booklet_section(pdf, "2. Scelgo cosa valorizzare e migliorare", content_w)
    _booklet_multi_field(pdf, BOOKLET_LABELS["strength"], _booklet_text_list(data, "strength"), content_w)
    _booklet_multi_field(pdf, BOOKLET_LABELS["growth_area"], _booklet_text_list(data, "growth_area"), content_w)
    _booklet_field(pdf, BOOKLET_LABELS["motivation"], _booklet_text(data, "motivation"), content_w)

    _booklet_section(pdf, "3. Obiettivo e strategia", content_w)
    period = " - ".join(part for part in (_booklet_text(data, "period_start"), _booklet_text(data, "period_end")) if part)
    _booklet_field(pdf, BOOKLET_LABELS["objective"], _booklet_text(data, "objective"), content_w)
    _booklet_field(pdf, BOOKLET_LABELS["strategy"], _booklet_text(data, "strategy"), content_w)
    _booklet_field(pdf, BOOKLET_LABELS["period"], period, content_w)

    _booklet_section(pdf, "4. Verifico il percorso", content_w)
    for key in ("commitment", "difficulties", "improvements", "discovery"):
        _booklet_field(pdf, BOOKLET_LABELS[key], _booklet_text(data, key), content_w)

    _booklet_section(pdf, "5. Biografia di apprendimento", content_w)
    for key in ("bio_date", "bio_context", "bio_discovery", "bio_keywords"):
        _booklet_field(pdf, BOOKLET_LABELS[key], _booklet_text(data, key), content_w)

    _booklet_section(pdf, "6. Note e valutazione finale", content_w)
    for key in ("student_notes", "final_satisfaction", "final_observations"):
        _booklet_field(pdf, BOOKLET_LABELS[key], _booklet_text(data, key), content_w)

    pdf_bytes = BytesIO()
    pdf.output(pdf_bytes)
    pdf_bytes.seek(0)
    return pdf_bytes
