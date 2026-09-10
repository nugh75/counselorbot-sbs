import type { Lang } from '@/lib/i18n';

const it = {
    location: 'Dove interviene la proposta', path: 'Chat guidata → QSA → ingresso nel passaggio',
    scope: 'Si modifica il testo che avvia questo passaggio, condiviso dalle sessioni QSA che lo utilizzano. Il pilota copre solo passaggi QSA non di sintesi.',
    composition: 'Il modello riceve anche istruzioni generali, direttive, riferimenti pedagogici e contesto. Qui la proposta riguarda soltanto le istruzioni del passaggio; persona del counselor, retrieval, skill e memoria personale non sono riprodotti nelle prove.',
    workflow: 'Scegli il passaggio → definisci obiettivi e modelli → rivedi i casi → esegui le prove → confronta la proposta → decidi.',
    baseline: 'Testo di partenza congelato per questa prova', preview: 'Testo attuale del passaggio (anteprima)',
    frozen: 'Percorso registrato alla creazione della prova; può differire dalla configurazione attuale.',
    unavailable: 'Dettagli del passaggio non disponibili nella prova salvata.', technical: 'Riferimenti tecnici',
    report: 'Pro e contro della proposta', expected: 'Beneficio atteso (ipotesi del proponente)',
    pros: 'A favore nelle prove', cons: 'Contro e limiti', neutral: 'Nessuna differenza misurata',
    noPros: 'Nessun vantaggio misurato disponibile.', noData: 'Confronto completo non disponibile: risultati mancanti, campioni diversi o errori per modello, lingua e insieme di casi.',
    synthetic: 'Le prove sintetiche non dimostrano un beneficio educativo e non coprono tutti i contesti reali.',
    evidence: 'Risposte che superano i controlli: testo di partenza → proposta. Le ripetizioni non sono studenti diversi; il confronto non sostituisce il giudizio complessivo.',
    verdict: 'Esito complessivo', noVerdict: 'Valutazione non disponibile.', shared: 'Modifica condivisa del passaggio, non personalizzata per un singolo studente o modello.',
};
type Copy = { [K in keyof typeof it]: string };
const en: Copy = {
    location: 'Where the proposal applies', path: 'Guided chat → QSA → step entry',
    scope: 'This changes the text that starts this step, shared by QSA sessions using it. The pilot covers QSA steps other than summaries only.',
    composition: 'The model also receives general instructions, directives, pedagogical references and context. This proposal concerns only the step instructions; counselor persona, retrieval, skills and personal memory are not reproduced in the trials.',
    workflow: 'Choose a step → define goals and models → review cases → run trials → compare the proposal → decide.',
    baseline: 'Starting text frozen for this trial', preview: 'Current step text (preview)', frozen: 'Path recorded when the trial was created; it may differ from the current configuration.',
    unavailable: 'Step details are unavailable in the saved trial.', technical: 'Technical references', report: 'Proposal benefits and drawbacks', expected: 'Expected benefit (proposer hypothesis)',
    pros: 'Evidence in favour', cons: 'Drawbacks and limits', neutral: 'No measured difference', noPros: 'No measured benefit available.',
    noData: 'Complete comparison unavailable: missing results, unequal samples or errors for a model, language or case split.',
    synthetic: 'Synthetic trials do not demonstrate educational benefit or cover every real context.',
    evidence: 'Responses passing the checks: starting text → proposal. Repetitions are not different students; this comparison does not replace the overall judgment.',
    verdict: 'Overall outcome', noVerdict: 'Evaluation unavailable.', shared: 'Shared step change, not tailored to one student or model.',
};
const es: Copy = {
    location: 'Dónde interviene la propuesta', path: 'Chat guiado → QSA → inicio del paso', scope: 'Se modifica el texto que inicia este paso, compartido por las sesiones QSA que lo utilizan. El piloto solo cubre pasos QSA distintos de las síntesis.',
    composition: 'El modelo también recibe instrucciones generales, directivas, referencias pedagógicas y contexto. La propuesta afecta solo a las instrucciones del paso; las pruebas no reproducen la personalidad del orientador, la recuperación de material, las habilidades ni la memoria personal.',
    workflow: 'Elige el paso → define objetivos y modelos → revisa los casos → ejecuta las pruebas → compara la propuesta → decide.',
    baseline: 'Texto inicial congelado para esta prueba', preview: 'Texto actual del paso (vista previa)', frozen: 'Recorrido registrado al crear la prueba; puede diferir de la configuración actual.', unavailable: 'Detalles del paso no disponibles en la prueba guardada.', technical: 'Referencias técnicas', report: 'Ventajas e inconvenientes de la propuesta', expected: 'Beneficio esperado (hipótesis del proponente)', pros: 'A favor en las pruebas', cons: 'Inconvenientes y límites', neutral: 'Ninguna diferencia medida', noPros: 'Ninguna ventaja medida disponible.', noData: 'Comparación completa no disponible: resultados ausentes, muestras desiguales o errores por modelo, idioma o conjunto de casos.', synthetic: 'Las pruebas sintéticas no demuestran un beneficio educativo ni cubren todos los contextos reales.', evidence: 'Respuestas que superan los controles: texto inicial → propuesta. Las repeticiones no son estudiantes distintos; esta comparación no sustituye el juicio global.', verdict: 'Resultado global', noVerdict: 'Evaluación no disponible.', shared: 'Cambio compartido del paso, no personalizado para un estudiante o modelo.',
};
const fr: Copy = {
    location: 'Où intervient la proposition', path: 'Chat guidé → QSA → début de l’étape', scope: 'Le texte qui lance cette étape est modifié pour les sessions QSA qui l’utilisent. Le pilote couvre uniquement les étapes QSA hors synthèses.',
    composition: 'Le modèle reçoit aussi des instructions générales, des directives, des références pédagogiques et du contexte. La proposition concerne uniquement les instructions de l’étape ; les essais ne reproduisent pas la personnalité du conseiller, la recherche de ressources, les compétences ni la mémoire personnelle.',
    workflow: 'Choisir l’étape → définir objectifs et modèles → examiner les cas → lancer les essais → comparer la proposition → décider.',
    baseline: 'Texte initial figé pour cet essai', preview: 'Texte actuel de l’étape (aperçu)', frozen: 'Parcours enregistré lors de la création de l’essai ; il peut différer de la configuration actuelle.', unavailable: 'Détails de l’étape indisponibles dans l’essai enregistré.', technical: 'Références techniques', report: 'Avantages et inconvénients de la proposition', expected: 'Bénéfice attendu (hypothèse du proposant)', pros: 'Éléments favorables dans les essais', cons: 'Inconvénients et limites', neutral: 'Aucune différence mesurée', noPros: 'Aucun avantage mesuré disponible.', noData: 'Comparaison complète indisponible : résultats manquants, échantillons inégaux ou erreurs par modèle, langue ou ensemble de cas.', synthetic: 'Les essais synthétiques ne démontrent aucun bénéfice éducatif et ne couvrent pas tous les contextes réels.', evidence: 'Réponses réussissant les contrôles : texte initial → proposition. Les répétitions ne sont pas des étudiants différents ; cette comparaison ne remplace pas le jugement global.', verdict: 'Résultat global', noVerdict: 'Évaluation indisponible.', shared: 'Modification partagée de l’étape, non personnalisée pour un étudiant ou un modèle.',
};
const de: Copy = {
    location: 'Wo der Vorschlag eingreift', path: 'Geführter Chat → QSA → Einstieg in den Schritt', scope: 'Geändert wird der Text, der diesen Schritt in den entsprechenden QSA-Sitzungen einleitet. Der Pilot umfasst nur QSA-Schritte ohne Zusammenfassungen.',
    composition: 'Das Modell erhält auch allgemeine Anweisungen, Richtlinien, pädagogische Referenzen und Kontext. Der Vorschlag betrifft nur die Schrittanweisungen; Beraterpersönlichkeit, Materialsuche, Skills und persönliches Gedächtnis werden in den Tests nicht nachgebildet.',
    workflow: 'Schritt wählen → Ziele und Modelle festlegen → Fälle prüfen → Tests ausführen → Vorschlag vergleichen → entscheiden.',
    baseline: 'Für diesen Test eingefrorener Ausgangstext', preview: 'Aktueller Schritttext (Vorschau)', frozen: 'Bei Erstellung des Tests gespeicherter Ablauf; er kann von der aktuellen Konfiguration abweichen.', unavailable: 'Schrittdetails im gespeicherten Test nicht verfügbar.', technical: 'Technische Referenzen', report: 'Vor- und Nachteile des Vorschlags', expected: 'Erwarteter Nutzen (Hypothese des Vorschlagenden)', pros: 'Positive Testergebnisse', cons: 'Nachteile und Grenzen', neutral: 'Kein gemessener Unterschied', noPros: 'Kein gemessener Vorteil verfügbar.', noData: 'Vollständiger Vergleich nicht verfügbar: fehlende Ergebnisse, ungleiche Stichproben oder Fehler je Modell, Sprache oder Fallgruppe.', synthetic: 'Synthetische Tests belegen keinen pädagogischen Nutzen und decken nicht alle realen Kontexte ab.', evidence: 'Antworten, die die Prüfungen bestehen: Ausgangstext → Vorschlag. Wiederholungen sind keine unterschiedlichen Lernenden; der Vergleich ersetzt nicht das Gesamturteil.', verdict: 'Gesamtergebnis', noVerdict: 'Bewertung nicht verfügbar.', shared: 'Gemeinsame Änderung des Schritts, nicht auf einzelne Lernende oder Modelle zugeschnitten.',
};
const sv: Copy = {
    location: 'Var förslaget används', path: 'Guidad chatt → QSA → stegets inledning', scope: 'Texten som inleder steget ändras för de QSA-sessioner som använder det. Piloten omfattar endast QSA-steg utom sammanfattningar.',
    composition: 'Modellen får också allmänna instruktioner, direktiv, pedagogiska referenser och sammanhang. Förslaget gäller endast stegets instruktioner; vägledarens personlighet, materialsökning, färdigheter och personligt minne återges inte i testerna.',
    workflow: 'Välj steg → ange mål och modeller → granska fall → kör tester → jämför förslaget → besluta.',
    baseline: 'Utgångstext sparad för detta test', preview: 'Aktuell stegtext (förhandsvisning)', frozen: 'Förlopp sparat när testet skapades; det kan skilja sig från den aktuella konfigurationen.', unavailable: 'Stegdetaljer saknas i det sparade testet.', technical: 'Tekniska referenser', report: 'Förslagets för- och nackdelar', expected: 'Förväntad nytta (förslagsställarens hypotes)', pros: 'Fördelar i testerna', cons: 'Nackdelar och begränsningar', neutral: 'Ingen uppmätt skillnad', noPros: 'Ingen uppmätt fördel tillgänglig.', noData: 'Fullständig jämförelse saknas: saknade resultat, olika stora urval eller fel per modell, språk eller fallgrupp.', synthetic: 'Syntetiska tester visar inte pedagogisk nytta och täcker inte alla verkliga sammanhang.', evidence: 'Svar som klarar kontrollerna: utgångstext → förslag. Upprepningar är inte olika studenter; jämförelsen ersätter inte helhetsbedömningen.', verdict: 'Samlat resultat', noVerdict: 'Bedömning saknas.', shared: 'Gemensam ändring av steget, inte anpassad till en enskild student eller modell.',
};
export const promptLabContextCopy: Record<Lang, Copy> = { it, en, es, fr, de, sv };
