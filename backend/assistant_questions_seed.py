"""Domande suggerite di default per l'assistente docenti.

Seed idempotente (italiano) per il pulsante "Prepara domanda" della pagina
/assistente. I topic combaciano con TOPIC_IDS del frontend
(questionari, validazione, didattica, fonti). Le altre lingue ricadono sulle
varianti i18n del frontend finche' un admin non aggiunge righe dedicate.
"""

DEFAULT_ASSISTANT_QUESTIONS: dict[str, list[str]] = {
    "questionari": [
        "Spiegami quali questionari sono disponibili e quando usarli con uno studente.",
        "Quali sono le differenze tra QSA, QSAr, ZTPI e Savickas e a chi si rivolgono?",
        "In che ordine conviene proporre i questionari in un percorso di counseling?",
        "A cosa serve il QSA e cosa misura esattamente?",
        "Che cosa distingue il QSAr dal QSA?",
        "Cosa misura lo ZTPI e come si leggono le sue dimensioni temporali?",
        "Quando è utile somministrare il Savickas rispetto agli altri strumenti?",
        "A chi sono destinati QPCS, QPCC e QAP?",
        "Quali questionari sono più adatti alla scuola secondaria di secondo grado?",
        "Quanto tempo richiede in media la compilazione di ciascun questionario?",
        "Quali risultati produce il QSA e come si presentano allo studente?",
        "Cosa sono i fattori del QSA e come si interpretano?",
        "Quali fattori del QSA sono invertiti e cosa significa per la lettura?",
        "Posso usare più questionari nello stesso percorso? Come li combino?",
        "Che differenza c'è tra uno strumento di apprendimento e uno di orientamento?",
        "Cosa restituisce il colloquio di costruzione di carriera di Savickas?",
        "Quali questionari indagano la prospettiva temporale dello studente?",
        "Come scelgo lo strumento giusto in base all'obiettivo del colloquio?",
        "Quali sono i destinatari tipici di ciascun questionario?",
        "Come spiego a uno studente lo scopo del questionario prima di iniziare?",
    ],
    "validazione": [
        "Riassumi lo stato della validazione degli strumenti e cosa significa profilo sperimentale.",
        "Cosa sono le stanine e le norme, e perché contano nell'interpretazione dei profili?",
        "Come si tengono separati ricerca e counseling nella raccolta dei dati?",
        "Cosa significa che un questionario è in fase di validazione?",
        "Come avviene l'adattamento linguistico di uno strumento in una nuova lingua?",
        "Quali accortezze servono nella raccolta dati per la ricerca?",
        "Perché un profilo sperimentale va comunicato con cautela allo studente?",
        "Cosa sono le norme di riferimento e da quale campione derivano?",
        "Come si calcola un punteggio standardizzato a partire dai dati grezzi?",
        "Che differenza c'è tra dato grezzo, punteggio standard e stanina?",
        "Cosa rende affidabile e valido un questionario psicometrico?",
        "Quali strumenti hanno norme consolidate e quali ancora sperimentali?",
        "Come gestisco il consenso informato nella raccolta dati di ricerca?",
        "Perché non bisogna usare un profilo sperimentale come diagnosi?",
        "Quali bias possono influenzare la compilazione e come limitarli?",
        "Come si garantisce l'anonimato dei dati raccolti per la ricerca?",
        "Cosa cambia tra somministrazione per ricerca e per counseling individuale?",
        "Quando un campione è sufficiente per costruire norme attendibili?",
        "Come interpreto un profilo se mancano norme per quella popolazione?",
        "Quali limiti devo dichiarare quando uso uno strumento in validazione?",
    ],
    "didattica": [
        "Come può un docente usare CounselorBot e i questionari in un percorso didattico?",
        "Come presento i risultati di un questionario a una classe senza creare etichette?",
        "Quali attività di riflessione posso costruire a partire da un profilo QSA?",
        "Come introduco gli strumenti a studenti che non li conoscono?",
        "Come integro la riflessione sui risultati nelle ore curricolari?",
        "Quali domande guida posso usare per far riflettere sui propri risultati?",
        "Come trasformo un profilo individuale in un'attività di gruppo?",
        "Come gestisco uno studente che riceve un profilo che non condivide?",
        "Quali strategie di apprendimento posso proporre a partire dai fattori QSA?",
        "Come collego i risultati dei questionari agli obiettivi formativi?",
        "Come uso lo ZTPI per parlare di gestione del tempo con la classe?",
        "Come imposto un colloquio individuale dopo la somministrazione?",
        "Quali errori evitare nel restituire i risultati agli studenti?",
        "Come coinvolgo gli studenti nella lettura autonoma del proprio profilo?",
        "Come uso il Savickas per un'attività di orientamento in classe?",
        "Quali materiali preparo prima di somministrare un questionario?",
        "Come spiego che non esistono risposte giuste o sbagliate?",
        "Come do continuità al percorso dopo la prima restituzione?",
        "Come adatto le attività all'età e al grado scolastico?",
        "Come valuto l'efficacia di un percorso basato sui questionari?",
    ],
    "fonti": [
        "Quali fonti del progetto posso consultare per approfondire competenze strategiche e QSA?",
        "Dove trovo le guide e gli studi del progetto competenzestrategiche.it?",
        "Quali materiali operativi mi consigli per iniziare con gli strumenti?",
        "Quali documenti spiegano la teoria dietro il QSA?",
        "Dove trovo i riferimenti scientifici sugli strumenti?",
        "Quali materiali di formazione sono disponibili per i docenti?",
        "Ci sono atti di convegni o pubblicazioni del progetto da consultare?",
        "Dove trovo esempi di restituzione dei profili agli studenti?",
        "Quali guide spiegano come somministrare correttamente i questionari?",
        "Esistono schede sintetiche sui singoli fattori del QSA?",
        "Dove trovo materiali sul modello delle competenze strategiche?",
        "Quali fonti approfondiscono la prospettiva temporale e lo ZTPI?",
        "Ci sono materiali sul colloquio di Savickas nel progetto?",
        "Dove trovo documenti sulla validazione degli strumenti?",
        "Quali risorse spiegano l'uso didattico dei questionari?",
        "Esistono materiali tradotti in altre lingue del progetto?",
        "Dove trovo riferimenti per citare correttamente gli strumenti?",
        "Quali studi documentano l'efficacia del percorso?",
        "Ci sono linee guida etiche per la somministrazione?",
        "Dove trovo aggiornamenti e novità del progetto?",
    ],
}


def seed_assistant_questions(db, models) -> None:
    """Inserisce le domande di default (it) se la tabella è vuota. Idempotente."""
    if db.query(models.AssistantQuestion).count() > 0:
        return
    for topic, questions in DEFAULT_ASSISTANT_QUESTIONS.items():
        for order, text in enumerate(questions):
            db.add(
                models.AssistantQuestion(
                    topic=topic,
                    language="it",
                    text=text,
                    sort_order=order,
                    is_active=True,
                )
            )
    db.commit()
