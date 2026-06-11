"""Multilingual student-facing guided texts (intro/conclusion/banner/labels).

These texts are shown verbatim to the student, so they must exist per language.
The Italian value lives in the base `Config` key (e.g. `text_ztpi_conclusion`);
every other language lives in a suffixed key (`text_ztpi_conclusion__en`, ...).

`/qsa/guided-ui-texts?lang=XX` resolves the suffixed key with fallback to the
base (Italian) value, and the admin edits the value of the selected language.

Scope: ONLY student-facing texts + fixed-phase labels. System prompts are not
here (English source + runtime language directive handles AI output).
"""

from typing import Callable, Dict, List, Optional

# Languages stored as suffixed keys; 'it' = base key (no suffix).
SECONDARY_LANGS = ["en", "es", "fr", "de", "sv"]

# Localized fragments for the dynamically-numbered "Questions" phase label/banner
# (QSAr/Savickas override the number in the endpoint).
QUESTIONS_LABEL = {
    "it": "Domande e Approfondimenti",
    "en": "Questions and Follow-up",
    "es": "Preguntas y Profundización",
    "fr": "Questions et Approfondissement",
    "de": "Fragen und Vertiefung",
    "sv": "Frågor och fördjupning",
}
PHASE_WORD = {
    "it": "Fase", "en": "Phase", "es": "Fase", "fr": "Phase", "de": "Phase", "sv": "Fas",
}


# Per-language translations, keyed by base Config key. 'it' is the DB base value.
GUIDED_TEXT_I18N: Dict[str, Dict[str, str]] = {
    "en": {
        "pqbl_onboarding_text": (
            "This path uses question-based learning: you learn by answering multiple-choice "
            "questions and reading the feedback for each answer. The questions are NOT an exam: "
            "they are the way you learn. Getting things wrong is part of the method: every answer, "
            "right or wrong, gives you a useful explanation. This kind of study can feel demanding: "
            "that's normal, and it's exactly that effort that helps you remember. If the session is "
            "long, consider splitting it into several moments instead of doing it all at once. You "
            "can also click the other options after finding the correct one, to read all the feedback."
        ),
        "label_guided_questions": "4. Questions and Follow-up",
        "label_guided_conclusion": "Conclusion",
        "text_guided_questions_phase_banner": "--- Phase 4: Questions and Follow-up ---",
        "text_guided_questions_intro": (
            "We have completed the structured analysis.\n"
            "Now we can turn the results into practical steps: feel free to ask me about doubts, "
            "real situations or study goals you want to work on."
        ),
        "text_guided_conclusion": (
            "You have completed the QSA path.\n"
            "You already have a clear foundation to build on: with small, steady steps you can improve a lot.\n"
            "Whenever you like, you can return to the Home Page and pick up from here."
        ),
        "text_qsar_questions_intro": (
            "We have completed the structured analysis of your QSAr profile. "
            "Now you can ask me any open question about the results or request specific advice."
        ),
        "text_qsar_conclusion": (
            "You have completed the QSAr analysis path. Click the button below to return to the Home Page."
        ),
        "text_ztpi_questions_intro": (
            "We have completed the structured analysis of your time perspective. "
            "Now you can ask me any open question about the results or request specific advice "
            "on how to work on your time balance."
        ),
        "text_ztpi_conclusion": (
            "You have completed the analysis path of your time perspective. "
            "Remember: working towards a balanced time perspective is a gradual journey. "
            "Click the button below to return to the Home Page."
        ),
        "text_savickas_questions_intro": (
            "We have completed the 5 questions of the Savickas interview. "
            "Now you can ask for clarifications on the summary or explore the next steps."
        ),
        "text_savickas_conclusion": (
            "You have completed the Savickas career counselling interview. "
            "You can use the summary as a compass and update it over time as you gain experience. "
            "Click the button below to return to the Home Page."
        ),
        "text_qpcs_questions_intro": (
            "We have explored your strategic competences together. "
            "Now you can ask me any open question or request practical advice."
        ),
        "text_qpcs_conclusion": (
            "You have completed the reflection path on your strategic competences (QPCS). "
            "Click the button below to return to the Home Page."
        ),
        "text_qpcc_questions_intro": (
            "We have explored your competences and beliefs together. "
            "Now you can ask me any open question or request practical advice."
        ),
        "text_qpcc_conclusion": (
            "You have completed the reflection path on competences and beliefs (QPCC). "
            "Click the button below to return to the Home Page."
        ),
        "text_qap_questions_intro": (
            "We have explored the resources of your career adaptability together. "
            "Now you can ask me any open question or request practical advice."
        ),
        "text_qap_conclusion": (
            "You have completed the path on career adaptability (QAP). "
            "Click the button below to return to the Home Page."
        ),
    },
    "es": {
        "pqbl_onboarding_text": (
            "Este recorrido usa el aprendizaje basado en preguntas (question-based learning): "
            "aprenderás respondiendo preguntas de opción múltiple y leyendo el feedback de cada "
            "respuesta. Las preguntas NO son un examen: son la forma en que se aprende. Equivocarse "
            "forma parte del método: cada respuesta, correcta o incorrecta, te da una explicación "
            "útil. Este tipo de estudio puede parecer cansado: es normal, y es justamente ese "
            "esfuerzo el que ayuda a recordar. Si la sesión es larga, valora dividirla en varios "
            "momentos en lugar de hacerla toda de una vez. También puedes hacer clic en las otras "
            "opciones después de encontrar la correcta, para leer todos los feedback."
        ),
        "label_guided_questions": "4. Preguntas y Profundización",
        "label_guided_conclusion": "Conclusión",
        "text_guided_questions_phase_banner": "--- Fase 4: Preguntas y Profundización ---",
        "text_guided_questions_intro": (
            "Hemos completado el análisis estructurado.\n"
            "Ahora podemos convertir los resultados en pasos prácticos: pregúntame dudas, "
            "situaciones reales u objetivos de estudio en los que quieras trabajar."
        ),
        "text_guided_conclusion": (
            "Has completado el recorrido QSA.\n"
            "Ya tienes una base clara sobre la que construir: con pequeños pasos constantes puedes mejorar mucho.\n"
            "Cuando quieras, puedes volver a la página de inicio y retomar desde aquí."
        ),
        "text_qsar_questions_intro": (
            "Hemos completado el análisis estructurado de tu perfil QSAr. "
            "Ahora puedes hacerme cualquier pregunta libre sobre los resultados o pedir consejos específicos."
        ),
        "text_qsar_conclusion": (
            "Has completado el recorrido de análisis del QSAr. Haz clic en el botón de abajo para volver a la página de inicio."
        ),
        "text_ztpi_questions_intro": (
            "Hemos completado el análisis estructurado de tu perspectiva temporal. "
            "Ahora puedes hacerme cualquier pregunta libre sobre los resultados o pedir consejos específicos "
            "sobre cómo trabajar tu equilibrio temporal."
        ),
        "text_ztpi_conclusion": (
            "Has completado el recorrido de análisis de tu perspectiva temporal. "
            "Recuerda: trabajar hacia una perspectiva temporal equilibrada es un proceso gradual. "
            "Haz clic en el botón de abajo para volver a la página de inicio."
        ),
        "text_savickas_questions_intro": (
            "Hemos completado las 5 preguntas de la entrevista de Savickas. "
            "Ahora puedes pedir aclaraciones sobre la síntesis o profundizar en los próximos pasos."
        ),
        "text_savickas_conclusion": (
            "Has completado la entrevista de orientación profesional de Savickas. "
            "Puedes usar la síntesis como brújula y actualizarla con el tiempo a medida que ganas experiencia. "
            "Haz clic en el botón de abajo para volver a la página de inicio."
        ),
        "text_qpcs_questions_intro": (
            "Hemos explorado juntos tus competencias estratégicas. "
            "Ahora puedes hacerme cualquier pregunta libre o pedir consejos prácticos."
        ),
        "text_qpcs_conclusion": (
            "Has completado el recorrido de reflexión sobre tus competencias estratégicas (QPCS). "
            "Haz clic en el botón de abajo para volver a la página de inicio."
        ),
        "text_qpcc_questions_intro": (
            "Hemos explorado juntos tus competencias y convicciones. "
            "Ahora puedes hacerme cualquier pregunta libre o pedir consejos prácticos."
        ),
        "text_qpcc_conclusion": (
            "Has completado el recorrido de reflexión sobre competencias y convicciones (QPCC). "
            "Haz clic en el botón de abajo para volver a la página de inicio."
        ),
        "text_qap_questions_intro": (
            "Hemos explorado juntos los recursos de tu adaptabilidad profesional. "
            "Ahora puedes hacerme cualquier pregunta libre o pedir consejos prácticos."
        ),
        "text_qap_conclusion": (
            "Has completado el recorrido sobre la adaptabilidad profesional (QAP). "
            "Haz clic en el botón de abajo para volver a la página de inicio."
        ),
    },
    "fr": {
        "pqbl_onboarding_text": (
            "Ce parcours utilise l'apprentissage basé sur les questions (question-based learning) : "
            "tu apprendras en répondant à des questions à choix multiples et en lisant le feedback "
            "de chaque réponse. Les questions NE sont PAS un examen : elles sont la façon dont on "
            "apprend. Se tromper fait partie de la méthode : chaque réponse, juste ou fausse, te "
            "donne une explication utile. Ce type d'étude peut sembler fatigant : c'est normal, et "
            "c'est justement cet effort qui aide à mémoriser. Si la séance est longue, envisage de "
            "la diviser en plusieurs moments plutôt que de tout faire d'un coup. Tu peux aussi "
            "cliquer sur les autres options après avoir trouvé la bonne, pour lire tous les feedbacks."
        ),
        "label_guided_questions": "4. Questions et Approfondissement",
        "label_guided_conclusion": "Conclusion",
        "text_guided_questions_phase_banner": "--- Phase 4 : Questions et Approfondissement ---",
        "text_guided_questions_intro": (
            "Nous avons terminé l'analyse structurée.\n"
            "Nous pouvons maintenant transformer les résultats en étapes pratiques : pose-moi tes questions, "
            "des situations réelles ou des objectifs d'étude sur lesquels tu veux travailler."
        ),
        "text_guided_conclusion": (
            "Tu as terminé le parcours QSA.\n"
            "Tu disposes déjà d'une base claire sur laquelle construire : avec de petits pas réguliers, tu peux beaucoup progresser.\n"
            "Quand tu veux, tu peux revenir à la page d'accueil et reprendre d'ici."
        ),
        "text_qsar_questions_intro": (
            "Nous avons terminé l'analyse structurée de ton profil QSAr. "
            "Tu peux maintenant me poser n'importe quelle question sur les résultats ou demander des conseils précis."
        ),
        "text_qsar_conclusion": (
            "Tu as terminé le parcours d'analyse du QSAr. Clique sur le bouton ci-dessous pour revenir à la page d'accueil."
        ),
        "text_ztpi_questions_intro": (
            "Nous avons terminé l'analyse structurée de ta perspective temporelle. "
            "Tu peux maintenant me poser n'importe quelle question sur les résultats ou demander des conseils précis "
            "sur la façon de travailler ton équilibre temporel."
        ),
        "text_ztpi_conclusion": (
            "Tu as terminé le parcours d'analyse de ta perspective temporelle. "
            "Souviens-toi : travailler vers une perspective temporelle équilibrée est un cheminement progressif. "
            "Clique sur le bouton ci-dessous pour revenir à la page d'accueil."
        ),
        "text_savickas_questions_intro": (
            "Nous avons terminé les 5 questions de l'entretien de Savickas. "
            "Tu peux maintenant demander des précisions sur la synthèse ou approfondir les prochaines étapes."
        ),
        "text_savickas_conclusion": (
            "Tu as terminé l'entretien d'orientation professionnelle de Savickas. "
            "Tu peux utiliser la synthèse comme boussole et la mettre à jour au fil du temps à mesure que tu acquiers de l'expérience. "
            "Clique sur le bouton ci-dessous pour revenir à la page d'accueil."
        ),
        "text_qpcs_questions_intro": (
            "Nous avons exploré ensemble tes compétences stratégiques. "
            "Tu peux maintenant me poser n'importe quelle question ou demander des conseils pratiques."
        ),
        "text_qpcs_conclusion": (
            "Tu as terminé le parcours de réflexion sur tes compétences stratégiques (QPCS). "
            "Clique sur le bouton ci-dessous pour revenir à la page d'accueil."
        ),
        "text_qpcc_questions_intro": (
            "Nous avons exploré ensemble tes compétences et tes convictions. "
            "Tu peux maintenant me poser n'importe quelle question ou demander des conseils pratiques."
        ),
        "text_qpcc_conclusion": (
            "Tu as terminé le parcours de réflexion sur les compétences et les convictions (QPCC). "
            "Clique sur le bouton ci-dessous pour revenir à la page d'accueil."
        ),
        "text_qap_questions_intro": (
            "Nous avons exploré ensemble les ressources de ton adaptabilité professionnelle. "
            "Tu peux maintenant me poser n'importe quelle question ou demander des conseils pratiques."
        ),
        "text_qap_conclusion": (
            "Tu as terminé le parcours sur l'adaptabilité professionnelle (QAP). "
            "Clique sur le bouton ci-dessous pour revenir à la page d'accueil."
        ),
    },
    "de": {
        "pqbl_onboarding_text": (
            "Dieser Weg nutzt fragenbasiertes Lernen (question-based learning): Du lernst, indem du "
            "Multiple-Choice-Fragen beantwortest und das Feedback zu jeder Antwort liest. Die Fragen "
            "sind KEINE Prüfung: Sie sind die Art, wie man lernt. Fehler zu machen gehört zur "
            "Methode: Jede Antwort, richtig oder falsch, gibt dir eine nützliche Erklärung. Diese Art "
            "zu lernen kann anstrengend wirken: Das ist normal, und genau diese Anstrengung hilft dir "
            "beim Erinnern. Wenn die Sitzung lang ist, teile sie lieber in mehrere Abschnitte auf, "
            "statt alles auf einmal zu machen. Du kannst nach der richtigen Option auch die anderen "
            "anklicken, um alle Rückmeldungen zu lesen."
        ),
        "label_guided_questions": "4. Fragen und Vertiefung",
        "label_guided_conclusion": "Abschluss",
        "text_guided_questions_phase_banner": "--- Phase 4: Fragen und Vertiefung ---",
        "text_guided_questions_intro": (
            "Wir haben die strukturierte Analyse abgeschlossen.\n"
            "Jetzt können wir die Ergebnisse in praktische Schritte umsetzen: Frag mich nach Zweifeln, "
            "realen Situationen oder Lernzielen, an denen du arbeiten möchtest."
        ),
        "text_guided_conclusion": (
            "Du hast den QSA-Pfad abgeschlossen.\n"
            "Du hast bereits eine klare Grundlage zum Aufbauen: mit kleinen, stetigen Schritten kannst du dich stark verbessern.\n"
            "Wann immer du möchtest, kannst du zur Startseite zurückkehren und hier weitermachen."
        ),
        "text_qsar_questions_intro": (
            "Wir haben die strukturierte Analyse deines QSAr-Profils abgeschlossen. "
            "Jetzt kannst du mir jede freie Frage zu den Ergebnissen stellen oder gezielte Ratschläge erbitten."
        ),
        "text_qsar_conclusion": (
            "Du hast den QSAr-Analysepfad abgeschlossen. Klicke auf die Schaltfläche unten, um zur Startseite zurückzukehren."
        ),
        "text_ztpi_questions_intro": (
            "Wir haben die strukturierte Analyse deiner Zeitperspektive abgeschlossen. "
            "Jetzt kannst du mir jede freie Frage zu den Ergebnissen stellen oder gezielte Ratschläge erbitten, "
            "wie du an deinem zeitlichen Gleichgewicht arbeiten kannst."
        ),
        "text_ztpi_conclusion": (
            "Du hast den Analysepfad deiner Zeitperspektive abgeschlossen. "
            "Denk daran: auf eine ausgewogene Zeitperspektive hinzuarbeiten ist ein schrittweiser Weg. "
            "Klicke auf die Schaltfläche unten, um zur Startseite zurückzukehren."
        ),
        "text_savickas_questions_intro": (
            "Wir haben die 5 Fragen des Savickas-Interviews abgeschlossen. "
            "Jetzt kannst du Erläuterungen zur Zusammenfassung erbitten oder die nächsten Schritte vertiefen."
        ),
        "text_savickas_conclusion": (
            "Du hast das Savickas-Interview zur Berufsberatung abgeschlossen. "
            "Du kannst die Zusammenfassung als Kompass nutzen und sie mit der Zeit aktualisieren, während du Erfahrung sammelst. "
            "Klicke auf die Schaltfläche unten, um zur Startseite zurückzukehren."
        ),
        "text_qpcs_questions_intro": (
            "Wir haben gemeinsam deine strategischen Kompetenzen erkundet. "
            "Jetzt kannst du mir jede freie Frage stellen oder praktische Ratschläge erbitten."
        ),
        "text_qpcs_conclusion": (
            "Du hast den Reflexionspfad zu deinen strategischen Kompetenzen (QPCS) abgeschlossen. "
            "Klicke auf die Schaltfläche unten, um zur Startseite zurückzukehren."
        ),
        "text_qpcc_questions_intro": (
            "Wir haben gemeinsam deine Kompetenzen und Überzeugungen erkundet. "
            "Jetzt kannst du mir jede freie Frage stellen oder praktische Ratschläge erbitten."
        ),
        "text_qpcc_conclusion": (
            "Du hast den Reflexionspfad zu Kompetenzen und Überzeugungen (QPCC) abgeschlossen. "
            "Klicke auf die Schaltfläche unten, um zur Startseite zurückzukehren."
        ),
        "text_qap_questions_intro": (
            "Wir haben gemeinsam die Ressourcen deiner beruflichen Anpassungsfähigkeit erkundet. "
            "Jetzt kannst du mir jede freie Frage stellen oder praktische Ratschläge erbitten."
        ),
        "text_qap_conclusion": (
            "Du hast den Pfad zur beruflichen Anpassungsfähigkeit (QAP) abgeschlossen. "
            "Klicke auf die Schaltfläche unten, um zur Startseite zurückzukehren."
        ),
    },
    "sv": {
        "pqbl_onboarding_text": (
            "Den här vägen använder frågebaserat lärande (question-based learning): du lär dig genom "
            "att svara på flervalsfrågor och läsa återkopplingen för varje svar. Frågorna är INTE ett "
            "prov: de är sättet man lär sig på. Att svara fel är en del av metoden: varje svar, rätt "
            "eller fel, ger dig en användbar förklaring. Den här typen av studier kan kännas "
            "ansträngande: det är normalt, och det är just den ansträngningen som hjälper dig att "
            "minnas. Om sessionen är lång, överväg att dela upp den i flera tillfällen i stället för "
            "att göra allt på en gång. Du kan också klicka på de andra alternativen efter att du "
            "hittat det rätta, för att läsa all återkoppling."
        ),
        "label_guided_questions": "4. Frågor och fördjupning",
        "label_guided_conclusion": "Avslutning",
        "text_guided_questions_phase_banner": "--- Fas 4: Frågor och fördjupning ---",
        "text_guided_questions_intro": (
            "Vi har slutfört den strukturerade analysen.\n"
            "Nu kan vi omsätta resultaten i praktiska steg: fråga mig gärna om tveksamheter, "
            "verkliga situationer eller studiemål du vill arbeta med."
        ),
        "text_guided_conclusion": (
            "Du har slutfört QSA-vägen.\n"
            "Du har redan en tydlig grund att bygga på: med små, stadiga steg kan du förbättras mycket.\n"
            "När du vill kan du gå tillbaka till startsidan och fortsätta härifrån."
        ),
        "text_qsar_questions_intro": (
            "Vi har slutfört den strukturerade analysen av din QSAr-profil. "
            "Nu kan du ställa vilken fri fråga som helst om resultaten eller be om specifika råd."
        ),
        "text_qsar_conclusion": (
            "Du har slutfört QSAr-analysvägen. Klicka på knappen nedan för att återgå till startsidan."
        ),
        "text_ztpi_questions_intro": (
            "Vi har slutfört den strukturerade analysen av ditt tidsperspektiv. "
            "Nu kan du ställa vilken fri fråga som helst om resultaten eller be om specifika råd "
            "om hur du kan arbeta med din tidsbalans."
        ),
        "text_ztpi_conclusion": (
            "Du har slutfört analysvägen för ditt tidsperspektiv. "
            "Kom ihåg: att arbeta mot ett balanserat tidsperspektiv är en gradvis resa. "
            "Klicka på knappen nedan för att återgå till startsidan."
        ),
        "text_savickas_questions_intro": (
            "Vi har slutfört de 5 frågorna i Savickas-intervjun. "
            "Nu kan du be om förtydliganden om sammanfattningen eller fördjupa nästa steg."
        ),
        "text_savickas_conclusion": (
            "Du har slutfört Savickas karriärvägledningsintervju. "
            "Du kan använda sammanfattningen som en kompass och uppdatera den över tid när du får erfarenhet. "
            "Klicka på knappen nedan för att återgå till startsidan."
        ),
        "text_qpcs_questions_intro": (
            "Vi har tillsammans utforskat dina strategiska kompetenser. "
            "Nu kan du ställa vilken fri fråga som helst eller be om praktiska råd."
        ),
        "text_qpcs_conclusion": (
            "Du har slutfört reflektionsvägen om dina strategiska kompetenser (QPCS). "
            "Klicka på knappen nedan för att återgå till startsidan."
        ),
        "text_qpcc_questions_intro": (
            "Vi har tillsammans utforskat dina kompetenser och övertygelser. "
            "Nu kan du ställa vilken fri fråga som helst eller be om praktiska råd."
        ),
        "text_qpcc_conclusion": (
            "Du har slutfört reflektionsvägen om kompetenser och övertygelser (QPCC). "
            "Klicka på knappen nedan för att återgå till startsidan."
        ),
        "text_qap_questions_intro": (
            "Vi har tillsammans utforskat resurserna i din yrkesmässiga anpassningsförmåga. "
            "Nu kan du ställa vilken fri fråga som helst eller be om praktiska råd."
        ),
        "text_qap_conclusion": (
            "Du har slutfört vägen om yrkesmässig anpassningsförmåga (QAP). "
            "Klicka på knappen nedan för att återgå till startsidan."
        ),
    },
}


def localized_key(base_key: str, language: Optional[str]) -> str:
    """Italian (and missing/unknown) -> base key; other supported langs -> suffixed key."""
    lang = (language or "it").lower()
    if lang == "it" or lang not in SECONDARY_LANGS:
        return base_key
    return f"{base_key}__{lang}"


def resolve_text(config_get: Callable[[str, str], str], base_key: str,
                 language: Optional[str], default: str = "") -> str:
    """Return the localized config value, falling back to the base (Italian) value."""
    lang = (language or "it").lower()
    if lang != "it" and lang in SECONDARY_LANGS:
        suffixed = config_get(f"{base_key}__{lang}", "")
        if (suffixed or "").strip():
            return suffixed
    return config_get(base_key, default)


def seed_definitions() -> List[Dict[str, str]]:
    """Suffixed-key seed definitions ({key, default, description}) for all secondary langs."""
    defs: List[Dict[str, str]] = []
    for lang in SECONDARY_LANGS:
        for base_key, value in GUIDED_TEXT_I18N[lang].items():
            defs.append({
                "key": f"{base_key}__{lang}",
                "default": value,
                "description": f"{base_key} [{lang}]",
            })
    return defs
