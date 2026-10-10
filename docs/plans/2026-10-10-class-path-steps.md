# Percorsi di classe: tipi di passo — piano

Stato: proposta approvata dall'utente il 10 ottobre 2026, non ancora implementata.
Tracciamento: milestone e issue su GitHub (vedi «Fasi»).

## Problema

L'editor dei percorsi (`frontend/src/components/teacher/ClassPathsTab.tsx`) mostra
cinque blocchi in colonna — Somministrazione, Approfondimento, Assegnazione, Forum e
«Scegli uno strumento abilitato…» — ciascuno con il proprio «Aggiungi passo».
L'ultimo menu elenca tutti gli strumenti abilitati della classe
(`backend/class_tools.py`): questionari, chat guidate, forum e strumenti personali.
Ne derivano doppioni con effetti diversi: un questionario inserito come strumento
non ha codice, istituto né raccolta dati, mentre come somministrazione sì; nulla
spiega la differenza. Mancano inoltre gli incontri con docente, classe, orientatori
o esperti.

## Decisioni

1. Un solo pulsante **+ Aggiungi passo**: prima si sceglie cosa fa lo studente, poi
   compare solo il modulo di quel tipo. Su telefono il modulo si espande sotto
   l'elenco dei passi.
2. Un questionario entra in un percorso **solo tramite somministrazione**.
3. Le chat guidate (anche non legate a questionari) sono un tipo esplicito.
4. Un'attività (assegnazione) può indicare **uno o più strumenti**, che lo studente
   apre in un **popup dentro l'attività** oppure a pagina intera.
5. Resta il passo **strumento** autonomo: lo studente deve poter usare uno strumento
   anche senza un'attività.
6. Nuovo tipo **incontro**: di classe/gruppo o individuale; in presenza o online,
   con data, ora, luogo o link.
7. Gli incontri individuali possono essere con il docente, con un **referente
   dell'istituto** (orientatore, sportello: elenco esistente in «Referenti ed
   eventi») o con un **esperto esterno** (nome e ruolo, senza account).
8. Gli appuntamenti individuali sono pubblicati dal docente, a data fissa o con
   **fasce orarie** che lo studente prenota; il docente vede, sposta o annulla.
9. La partecipazione agli incontri la segna **lo studente**; nessun registro
   presenze del docente.
10. Ogni chat guidata può avere un **seguito**: debriefing con la classe,
    appuntamento individuale oppure **nessun seguito**.
11. Per ora **gestisce tutto il docente**, anche per orientatori ed esperti, e
    l'invito alla persona esterna lo manda lui via email, fuori dalla piattaforma.
    In futuro orientatori ed esperti potranno entrare con un ruolo dedicato (terza
    figura) per gestire fasce e prenotazioni: il modello dati deve permetterlo.

12. Un percorso nasce come **modello generale**, non legato a una classe, e si
    **applica** a una o più classi o gruppi. Classe e gruppo sono lo stesso oggetto
    (`StudentGroup`): un gruppo può non essere una classe, per esempio i tutor di
    Roma Tre; per questo l'interfaccia dice «classe o gruppo».
13. Applicare un modello crea una **copia** per la classe o il gruppo. Le modifiche
    al modello non cambiano i percorsi già applicati finché il docente non sceglie
    **«Aggiorna da modello»**: un percorso avviato non cambia sotto gli studenti.
14. I modelli sono visibili **solo al docente che li crea**. Il docente può
    **condividerli**: un modello condiviso diventa un **preset** disponibile a tutti i
    docenti, che lo applicano o lo copiano tra i propri modelli. La condivisione
    è immediata, **senza revisione amministrativa**.
15. «Aggiorna da modello» cambia **solo i passi che nessuno studente ha ancora
    iniziato**; i passi già avviati restano invariati.

## Modelli e percorsi applicati

```
Percorsi (Area docente)
 ├─ I miei modelli
 │   └─ «Inizio anno – metodo di studio»  [Modifica] [Condividi] [Applica a… ▾]
 ├─ Preset condivisi
 │   └─ «Orientamento in uscita»           [Applica a… ▾] [Copia nei miei modelli]
 └─ Applicati a classi e gruppi
     ├─ 3B Liceo        · da «Inizio anno…» · pubblicato · 12/24 completati
     └─ Tutor Roma Tre  · da «Inizio anno…» · bozza  [Aggiorna da modello]
```

- **Nel modello** i passi sono astratti: questionario = strumento e lingua; chat
  guidata = strumento e tipo di seguito; attività = obiettivo, istruzioni e
  strumenti; incontro = tipo, modalità e durata; discussione = titolo e testo
  d'apertura.
- **Applicandolo** si crea il percorso della classe o del gruppo e si preparano gli
  oggetti concreti: somministrazione (serve l'istituto), assegnazione, discussione.
  Il docente completa ciò che dipende dalla classe — date, luogo o link degli
  incontri, fasce — e poi pubblica.
- **«Aggiorna da modello»** mostra le differenze e le applica solo ai passi non
  ancora iniziati da nessuno studente; i passi già avviati restano invariati.
- **I percorsi esistenti** diventano percorsi applicati senza modello; l'azione
  «Salva come modello» permette di riusarli.

## Tipi di passo

| Tipo | Contenuto | `step_type` |
|---|---|---|
| Questionario | Somministrazione esistente o nuova (strumento, lingua, titolo); avviso se la classe non ha istituto | `questionnaire_administration` (esistente) |
| Chat guidata | Sui risultati di un passo questionario precedente, oppure autonoma (SAVICKAS, EVENTO_STUDIO, EVENTO_PROFESSIONALE, IDEA, OBIETTIVO_STUDIO); seguito facoltativo | `guided_results_chat` (esistente) + chat autonoma (nuova) |
| Attività | Assegnazione esistente o nuova, con 0..n strumenti apribili in popup | `assignment` (esistente) + strumenti (nuovo) |
| Strumento | Uno strumento personale (Tavolo, obiettivi, azioni, linea del tempo, Portfolio, flashcard, carte, confronto, Bussola, assistente); lo studente segna il passo fatto | `tool` (esistente, menu filtrato) |
| Incontro | Di classe/gruppo o individuale; con docente, referente o esperto; data fissa o fasce; in presenza o online | `meeting` (nuovo) |
| Discussione | Discussione del forum di classe | `forum` (esistente) |

```
┌ + Aggiungi passo ───────────────────────────────────────┐
│ Cosa fa lo studente in questo passo?                    │
│ ( ) Compila un questionario                             │
│ ( ) Fa una chat guidata                                 │
│ ( ) Svolge un'attività                                  │
│ ( ) Usa uno strumento                                   │
│ ( ) Partecipa a un incontro                             │
│ ( ) Partecipa a una discussione                         │
└─────────────────────────────────────────────────────────┘

Fa una chat guidata
  Strumento:  [ SAVICKAS ▾ ]   (oppure «sui risultati del passo #2»)
  Seguito:    (•) Debriefing con la classe → [ incontro esistente ▾ | + nuovo ]
              ( ) Appuntamento individuale
              ( ) Nessun seguito

Svolge un'attività
  Assegnazione: [ scegli… ▾ ]  [+ Nuova]
  Strumenti:    [x] Tavolo  [x] Portfolio  [ ] Flashcard  [ ] Obiettivi …

Partecipa a un incontro
  Tipo:      ( ) Di classe / di gruppo   (•) Individuale
  Con chi:   (•) Io (docente)
             ( ) Referente dell'istituto  [ Sportello orientamento ▾ ]
             ( ) Esperto esterno          [ nome, ruolo ]
  Quando:    ( ) Data fissa   (•) Fasce prenotabili  [+ fascia]
  Modalità:  ( ) In presenza [luogo]   (•) Online [link]
```

## Compatibilità

- I passi esistenti restano validi. Questionari o chat già inseriti come
  `tool` continuano a funzionare e nell'elenco sono segnalati come «inserito come
  strumento: non raccoglie dati di somministrazione»; non se ne creano di nuovi.
- Il seguito di una chat è un passo `meeting` collegato, inserito subito dopo la chat.
- Gli incontri e le prenotazioni registrano l'organizzatore separatamente da chi
  gestisce le fasce, così un futuro ruolo orientatore/esperto può subentrare senza
  migrare i dati.

## Fasi (una PR ciascuna)

Milestone GitHub «Class path templates, step types and meetings» (#7); ogni fase è una
issue con criteri di accettazione e dipendenze.

0. **Modelli e applicazione** (#172) — tabella dei modelli e dei loro passi astratti,
   collegamento percorso → modello d'origine, «Applica a…», «Salva come modello»,
   «Aggiorna da modello», condivisione come preset. Migrazione: i percorsi esistenti
   restano percorsi applicati senza modello.
1. **Aggiungi passo unico** (#173) — scelta del tipo e moduli specifici; il menu
   strumenti mostra solo gli strumenti personali. Solo interfaccia.
2. **Strumenti nell'attività** (#174) — campo elenco sull'assegnazione, migrazione,
   dialogo «Nuova assegnazione», popup lato studente.
3. **Incontri di classe/gruppo** (#175) — tabella, passo `meeting`, scheda studente nel
   percorso e nella linea del tempo, partecipazione segnata dallo studente.
4. **Incontri individuali e fasce** (#176) — con docente, referente o esperto; fasce,
   prenotazione, spostamento e annullamento; prenotazioni concorrenti sulla stessa
   fascia gestite in modo transazionale.
5. **Chat guidata autonoma con seguito** (#177) — tipo esplicito e collegamento al passo
   incontro.

Ogni fase aggiorna `docs-counselorbot/funzionalita-counselorbot.md`, la Guida e i
test, ed esegue `make guidance-refresh` / `make guidance-check` dopo l'ultima
modifica ai file di prodotto, immagini comprese.

## Fuori ambito per ora

- Account e ruolo dedicato per orientatori ed esperti.
- Invio automatico di inviti o promemoria via email.
