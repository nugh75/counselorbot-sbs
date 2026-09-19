# Cataloghi curati dai docenti

Il ruolo docente può curare direttamente i cataloghi condivisi di strategie e
letture/materiali. Film, libri, documentari, serie, articoli, podcast e video
usano il catalogo delle letture. Non è prevista approvazione amministrativa.

## Interfaccia

In **Area docenti → Cataloghi**, aprire **Strategie** oppure **Libri, film e altri
materiali**. Gli editor sono gli stessi disponibili nella console amministrativa:
non esiste una copia separata del catalogo per docente o per classe.

Le voci possono essere create, modificate, pubblicate, disattivate ed eliminate.
**Bozza** conserva il lavoro senza renderlo disponibile ai consigli;
**Pubblicata** rende la voce attiva idonea al recupero contestuale. Restano i
controlli sui temi, sulle fonti e sulle avvertenze dei materiali sensibili.
Gli editor mantengono il modulo aperto anche chiudendo e riaprendo la sezione.

## Permessi

`auth.get_current_catalog_editor` ammette docenti, ricercatori e amministratori.
Studenti e utenti anonimi sono esclusi anche chiamando direttamente le API.

- Gestione completa di `/admin/certified-strategies` e
  `/admin/certified-readings`, inclusi traduzione, verifica e recupero sinossi.
- Lettura di `/admin/reading-themes`, `/admin/instruments` e
  `/admin/instruments/{code}/factors` per compilare le schede.
- Elenco, stati e promozioni di `/admin/content-versions` limitati ai tipi
  `certified_strategy` e `certified_reading` per i docenti.
- Configurazione, scrittura degli strumenti, norme psicometriche e versioni
  degli altri tipi di contenuto mantengono i permessi amministrativi precedenti.

Il prefisso storico `/admin` degli endpoint non implica un ruolo amministrativo:
il controllo viene eseguito da ciascun endpoint. Nessuna migrazione del database
è necessaria.

## Pubblicazione e lingue

Quando una voce nasce pubblicata o passa da bozza a pubblicata, viene registrata
anche la pubblicazione della prima lingua completa, nell'ordine delle lingue
dell'app (italiano, inglese, spagnolo, francese, tedesco, svedese). Questo evita
che una bozza appena pubblicata resti invisibile a causa del registro linguistico.
L'identità autenticata del curatore è registrata in `approved_by`, con data.
Le altre versioni linguistiche già presenti mantengono il proprio stato;
il docente può pubblicarle dall'editor senza un passaggio amministrativo.

## Verifiche

- `python -m pytest backend/tests/test_teacher_catalogs.py -q`: API reali,
  database SQLite temporaneo; ruoli, pubblicazione immediata e da bozza,
  disponibilità nei consigli, confini delle versioni linguistiche.
- `TEACHER_CATALOGS_BASE_URL=http://127.0.0.1:3097 node --test
  tests/teacher-catalogs.test.mjs` dalla cartella `frontend`: interfaccia reale,
  API simulate e nessun dato di produzione; pubblicazione, bozze del modulo,
  desktop/mobile, tema scuro, lingua inglese e accesso studente negato.
