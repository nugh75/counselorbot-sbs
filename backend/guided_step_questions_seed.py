"""Domande suggerite per gli step della chat guidata.

Seed idempotente in italiano: se un questionario/step/lingua ha gia' righe,
non viene sovrascritto. Lo step speciale ``questions`` rappresenta la fase
fissa "Domande e Approfondimenti" dei percorsi non-Savickas.
"""

FIXED_QUESTIONS_STEP_ID = "questions"

DEFAULT_GUIDED_STEP_QUESTIONS: dict[str, dict[str, list[str]]] = {
    "QSA": {
        "intro": [
            "Come funziona questo percorso?",
            "Cosa devo aspettarmi dall'analisi del mio profilo?",
            "Puoi spiegarmi come leggeremo i risultati?",
        ],
        "cognitive": [
            "Quali fattori cognitivi sono piu' importanti nel mio profilo?",
            "Qual e' il mio punto di forza principale nello studio?",
            "Su quale strategia cognitiva dovrei lavorare per prima?",
        ],
        "affective": [
            "Quali aspetti emotivi influenzano di piu' il mio studio?",
            "C'e' qualcosa nel mio profilo che puo' ostacolarmi?",
            "Come posso gestire meglio motivazione, ansia o perseveranza?",
        ],
        "sl-elaboration": [
            "Come posso organizzare meglio quello che studio?",
            "Che ruolo hanno mappe, schemi e autointerrogazione nel mio profilo?",
            "Puoi farmi un esempio pratico di metodo di studio adatto a me?",
        ],
        "sl-selfcontrol": [
            "Come posso migliorare concentrazione e autoregolazione?",
            "Cosa significa questo step per il mio modo di studiare?",
            "Quale piccola abitudine posso provare questa settimana?",
        ],
        "sl-motivation": [
            "Da cosa sembra dipendere la mia motivazione?",
            "Come posso rafforzare la fiducia nelle mie capacita'?",
            "Cosa posso fare quando mi manca la perseveranza?",
        ],
        "sl-emotions": [
            "Come posso gestire meglio ansia o interferenze emotive?",
            "Quali situazioni potrebbero mettermi piu' in difficolta'?",
            "Puoi suggerirmi una strategia semplice da usare subito?",
        ],
        "sl-attribution": [
            "Come interpreto successi e difficolta'?",
            "Questo profilo mostra uno stile attributivo utile o da migliorare?",
            "Come posso leggere gli errori in modo piu' costruttivo?",
        ],
        "sl-social": [
            "Che ruolo ha la collaborazione nel mio profilo?",
            "Studiare con altri puo' aiutarmi?",
            "Come posso usare meglio il lavoro di gruppo?",
        ],
        FIXED_QUESTIONS_STEP_ID: [
            "Qual e' la sintesi piu' importante del mio profilo?",
            "Da dove mi consigli di iniziare concretamente?",
            "Puoi propormi un piccolo piano d'azione?",
        ],
    },
    "QSAr": {
        "qsar-intro": [
            "Come funziona il percorso QSAr?",
            "In cosa il QSAr e' diverso dal QSA completo?",
            "Come useremo i miei risultati in questa analisi?",
        ],
        "qsar-cognitive": [
            "Quali aspetti cognitivi emergono di piu' dal mio QSAr?",
            "Quale strategia di studio sembra gia' funzionare?",
            "Quale fattore cognitivo dovrei allenare per primo?",
        ],
        "qsar-affective": [
            "Quali aspetti emotivi o motivazionali emergono dal mio QSAr?",
            "Cosa puo' ostacolare di piu' il mio studio?",
            "Come posso usare questi risultati senza etichettarmi?",
        ],
        "qsar-processing": [
            "Come posso migliorare elaborazione e organizzazione?",
            "Che ruolo hanno schemi e collegamenti nel mio profilo?",
            "Puoi propormi un metodo semplice per ricordare meglio?",
        ],
        "qsar-selfcontrol": [
            "Come posso lavorare su autoregolazione e attenzione?",
            "Quale routine breve puo' aiutarmi a restare concentrato?",
            "Cosa posso fare quando mi distraggo facilmente?",
        ],
        "qsar-motivation": [
            "Come posso sostenere motivazione e fiducia?",
            "Quale segnale mi dice che sto perdendo continuita'?",
            "Puoi suggerirmi un obiettivo realistico per questa settimana?",
        ],
        "qsar-emotions": [
            "Come posso gestire l'ansia durante lo studio o le prove?",
            "Quale strategia emotiva potrei provare subito?",
            "Come distinguo una difficolta' temporanea da un blocco?",
        ],
        "qsar-attributions": [
            "Come leggo le cause dei miei successi e insuccessi?",
            "Quale spiegazione dei miei errori mi aiuta a migliorare?",
            "Come posso trasformare un risultato negativo in un passo utile?",
        ],
        FIXED_QUESTIONS_STEP_ID: [
            "Qual e' il messaggio principale del mio profilo QSAr?",
            "Quali due azioni pratiche mi consigli?",
            "Come posso monitorare i miglioramenti nelle prossime settimane?",
        ],
    },
    "ZTPI": {
        "ztpi-intro": [
            "Come funziona l'analisi della prospettiva temporale?",
            "Cosa significa leggere il mio rapporto con passato, presente e futuro?",
            "Come useremo i punteggi senza ridurli a etichette?",
        ],
        "ztpi-t1": [
            "Cosa significa per me il rapporto con il passato negativo?",
            "Come posso evitare che ricordi o rimpianti pesino sul presente?",
            "Quale piccolo passo puo' aiutarmi a rielaborare le difficolta' passate?",
        ],
        "ztpi-t2": [
            "Che risorsa puo' essere il passato positivo nel mio profilo?",
            "Come posso usare i ricordi positivi senza restare bloccato nel passato?",
            "Quale esperienza passata puo' sostenermi oggi?",
        ],
        "ztpi-t3": [
            "Cosa significa vivere bene il presente nel mio profilo?",
            "Come posso bilanciare piacere immediato e responsabilita'?",
            "Quando il carpe diem mi aiuta e quando rischia di distrarmi?",
        ],
        "ztpi-t4": [
            "Cosa indica il presente fatalistico nel mio profilo?",
            "Come posso aumentare la sensazione di controllo sulle mie scelte?",
            "Quale azione piccola ma concreta puo' ridurre la rassegnazione?",
        ],
        "ztpi-t5": [
            "Come uso il futuro nella mia motivazione?",
            "Il mio orientamento al futuro mi aiuta o mi mette pressione?",
            "Come posso trasformare un obiettivo futuro in un passo di oggi?",
        ],
        "ztpi-btp": [
            "Quanto e' equilibrata la mia prospettiva temporale?",
            "Quale dimensione temporale dovrei riequilibrare per prima?",
            "Puoi propormi una strategia per bilanciare passato, presente e futuro?",
        ],
        FIXED_QUESTIONS_STEP_ID: [
            "Qual e' la lettura complessiva del mio profilo temporale?",
            "Quale abitudine quotidiana puo' aiutarmi a riequilibrarmi?",
            "Come collego questa analisi alle mie scelte di studio o orientamento?",
        ],
    },
    "SAVICKAS": {
        "savickas-intro": [
            "Come funziona l'intervista Savickas?",
            "Che cosa emergera' dalle cinque domande narrative?",
            "Come useremo le mie risposte per parlare di orientamento?",
        ],
        "savickas-patto": [
            "Perche' serve un patto di collaborazione?",
            "Che tipo di risposte dovrei dare?",
            "Posso rispondere anche se non sono sicuro?",
        ],
        "savickas-q1": [
            "Come scelgo le tre persone che ammiravo?",
            "Posso indicare personaggi inventati?",
            "Quali qualita' devo osservare nei miei modelli?",
        ],
        "savickas-q2": [
            "Che tipo di contenuti posso citare?",
            "Conta di piu' cosa seguo o perche' mi interessa?",
            "Come collego i miei interessi alle scelte future?",
        ],
        "savickas-q3": [
            "E se non ho una storia preferita?",
            "Posso parlare di un film, una serie o un gioco?",
            "Che cosa dovrei notare nella storia che scelgo?",
        ],
        "savickas-q4": [
            "Come trovo il mio motto personale?",
            "Posso usare una frase che non ho inventato io?",
            "Come capisco se una frase guida davvero le mie scelte?",
        ],
        "savickas-q5": [
            "Che cosa si intende per ricordi precoci?",
            "Se non ricordo bene i dettagli, posso raccontare quello che so?",
            "Perche' devo dare un titolo a ogni ricordo?",
        ],
        "savickas-final": [
            "Qual e' il tema centrale che emerge dalla mia storia?",
            "Quali direzioni future sembrano coerenti con il mio racconto?",
            "Puoi aiutarmi a trasformare la sintesi in un piano 7/30/90 giorni?",
        ],
    },
    "QPCS": {
        "qpcs-intro": [
            "Come funziona il percorso QPCS?",
            "Che cosa sono le competenze strategiche?",
            "Come leggeremo i miei punteggi?",
        ],
        "qpcs-welcome": [
            "Come funziona il percorso QPCS?",
            "Che cosa sono le competenze strategiche?",
            "Come leggeremo i miei punteggi?",
        ],
        "qpcs-factors": [
            "Quali competenze strategiche emergono di piu' dal mio profilo?",
            "Quale area dovrei rafforzare per prima?",
            "Puoi propormi un esercizio pratico sulle mie competenze?",
        ],
        "qpcs-emozioni": [
            "Come gestisco emozioni e ansia nelle situazioni difficili?",
            "Quale esempio concreto posso osservare per capire meglio quest'area?",
            "Che strategia posso provare quando sento tensione o paura di sbagliare?",
        ],
        "qpcs-comunicazione": [
            "Come posso migliorare la mia comunicazione con gli altri?",
            "In quali situazioni relazionali questa competenza mi serve di piu'?",
            "Puoi aiutarmi a capire come preparo e controllo quello che comunico?",
        ],
        "qpcs-volizione": [
            "Come posso sostenere volonta' e perseveranza?",
            "Cosa posso fare quando un compito diventa noioso o faticoso?",
            "Quale abitudine mi aiuterebbe a portare a termine cio' che inizio?",
        ],
        "qpcs-apprendimento": [
            "Quali strategie di apprendimento emergono dal mio profilo?",
            "Come posso collegare meglio le nuove informazioni a quello che so gia'?",
            "Quando la collaborazione puo' aiutarmi a imparare meglio?",
        ],
        "qpcs-fiducia": [
            "Come posso rafforzare la fiducia nelle mie competenze?",
            "Che rapporto c'e' tra questa area e il mio progetto di vita?",
            "Quale segnale concreto mi dice che sto diventando piu' sicuro?",
        ],
        "qpcs-sintesi": [
            "Quali risorse ricorrenti emergono dal percorso QPCS?",
            "Quali aree di crescita dovrei affrontare con priorita'?",
            "Puoi trasformare la sintesi in un piano 7/30/90 giorni?",
        ],
        FIXED_QUESTIONS_STEP_ID: [
            "Qual e' la sintesi del mio profilo QPCS?",
            "Come posso usare queste competenze nello studio o nel lavoro?",
            "Quale piccolo obiettivo posso darmi per la prossima settimana?",
        ],
    },
    "QPCC": {
        "qpcc-intro": [
            "Come funziona il percorso QPCC?",
            "Che cosa significa analizzare competenze e convinzioni?",
            "Come useremo i miei punteggi in modo pratico?",
        ],
        "qpcc-welcome": [
            "Come funziona il percorso QPCC?",
            "Che cosa significa analizzare competenze e convinzioni?",
            "Come useremo i miei punteggi in modo pratico?",
        ],
        "qpcc-factors": [
            "Quali competenze o convinzioni emergono di piu'?",
            "Quale area puo' sostenere meglio le mie scelte?",
            "Quale convinzione su di me dovrei osservare con piu' attenzione?",
        ],
        "qpcc-comunicazione": [
            "Come vivo la comunicazione in pubblico?",
            "Come posso preparare meglio un intervento davanti agli altri?",
            "Quale esempio concreto mostra il mio modo di comunicare?",
        ],
        "qpcc-controllo": [
            "Come gestisco ansia e responsabilita' nelle decisioni?",
            "Quando sento piu' pressione e cosa posso fare?",
            "Quale strategia mi aiuta a mantenere controllo senza irrigidirmi?",
        ],
        "qpcc-volizione": [
            "Come posso rafforzare volizione e autoregolazione?",
            "Cosa mi aiuta a organizzare il lavoro e portarlo a termine?",
            "Quale routine posso provare per essere piu' costante?",
        ],
        "qpcc-elaborazione": [
            "Come elaboro e collego quello che apprendo?",
            "Puoi suggerirmi una strategia per applicare meglio cio' che studio?",
            "Quale metodo puo' aiutarmi a passare dalla comprensione all'uso concreto?",
        ],
        "qpcc-convinzioni": [
            "Quali convinzioni su di me emergono dal percorso?",
            "Come posso distinguere una convinzione utile da una limitante?",
            "Che cosa posso fare per rafforzare fiducia e motivazione?",
        ],
        "qpcc-sintesi": [
            "Quali competenze e convinzioni emergono come risorse?",
            "Quale convinzione dovrei monitorare nel tempo?",
            "Puoi trasformare la sintesi in un piano 7/30/90 giorni?",
        ],
        FIXED_QUESTIONS_STEP_ID: [
            "Qual e' la sintesi del mio profilo QPCC?",
            "Come collego competenze e convinzioni alle mie decisioni?",
            "Puoi propormi un piano breve per rafforzare un'area?",
        ],
    },
    "QAP": {
        "qap-intro": [
            "Come funziona il percorso QAP?",
            "Che cosa significa adattabilita' professionale?",
            "Come leggeremo le quattro risorse del mio profilo?",
        ],
        "qap-welcome": [
            "Come funziona il percorso QAP?",
            "Che cosa significa adattabilita' professionale?",
            "Come leggeremo le quattro risorse del mio profilo?",
        ],
        "qap-factors": [
            "Quale risorsa di adattabilita' e' piu' forte nel mio profilo?",
            "Quale risorsa dovrei sviluppare per affrontare meglio le scelte?",
            "Puoi farmi un esempio concreto legato al mio futuro professionale?",
        ],
        "qap-preoccupazione": [
            "Quanto sto pensando e preparando il mio futuro?",
            "Come posso collegare le scelte di oggi alle possibilita' di domani?",
            "Quale azione concreta puo' aumentare il mio orientamento al futuro?",
        ],
        "qap-controllo": [
            "Quanto sento di poter controllare le mie scelte?",
            "Come posso aumentare autonomia e responsabilita' decisionale?",
            "Quale decisione piccola posso prendere per allenare controllo?",
        ],
        "qap-curiosita": [
            "Quanto sto esplorando alternative e opportunita'?",
            "Come posso diventare piu' curioso verso percorsi che conosco poco?",
            "Quale esplorazione concreta posso fare questa settimana?",
        ],
        "qap-fiducia": [
            "Quanto mi sento capace di affrontare problemi e ostacoli?",
            "Come posso rafforzare fiducia e problem solving?",
            "Quale esperienza passata mi mostra che so affrontare difficolta'?",
        ],
        "qap-sintesi": [
            "Quale risorsa di adattabilita' sostiene di piu' il mio futuro?",
            "Quale risorsa dovrei allenare con priorita'?",
            "Puoi trasformare la sintesi in un piano 7/30/90 giorni?",
        ],
        FIXED_QUESTIONS_STEP_ID: [
            "Qual e' la sintesi del mio profilo QAP?",
            "Come posso esplorare meglio le opportunita' future?",
            "Quale azione concreta posso fare nei prossimi sette giorni?",
        ],
    },
}


def seed_guided_step_questions(db, models) -> None:
    """Inserisce le domande di default mancanti per questionario/step/lingua."""

    changed = False
    for questionnaire_type, step_questions in DEFAULT_GUIDED_STEP_QUESTIONS.items():
        for step_id, questions in step_questions.items():
            existing = (
                db.query(models.GuidedStepQuestion.id)
                .filter(
                    models.GuidedStepQuestion.questionnaire_type == questionnaire_type,
                    models.GuidedStepQuestion.step_id == step_id,
                    models.GuidedStepQuestion.language == "it",
                )
                .first()
            )
            if existing:
                continue
            for order, text in enumerate(questions):
                db.add(
                    models.GuidedStepQuestion(
                        questionnaire_type=questionnaire_type,
                        step_id=step_id,
                        language="it",
                        text=text,
                        sort_order=order,
                        is_active=True,
                    )
                )
                changed = True
    if changed:
        db.commit()
