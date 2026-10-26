# Allegato DPIA — app desktop docente, profilo L2 teacher-pc

**[DA VALIDARE] — bozza tecnica F1-17/P16, 25 ottobre 2026.** Questo allegato
precompila il profilo PC docente dello [schema DPIA](bozze/08-schema-dpia.md).
Non costituisce una valutazione approvata né una dichiarazione di conformità.
Il Titolare e il DPO completano lo schema, le decisioni e il rischio residuo;
le informative restano le [bozze P16](bozze/README.md).

## Perimetro da compilare

- Titolare, DPO, referente PC, data e versione/commit: **[DA VALIDARE / DA COMPILARE]**.
- Numero di classi/studenti, età, finalità e categorie di dati: **[DA VALIDARE]**.
- Proprietà del PC e autorizzazione al suo uso scolastico: **[DA VALIDARE]**.
- Modalità: [ ] prova sintetica [ ] lezione; [ ] quick tunnel [ ] dominio nominativo.
- Provider/modelli e paesi dei destinatari; contratto Cloudflare e provider:
  **[DA VALIDARE]**, usando le decisioni [04-D2, D3, D10, D11 e D14](04-decisioni-titolare-dpo.md).
- Versione di informative e basi giuridiche adottate per ciascuna finalità:
  **[DA VALIDARE]**. Il codice di abbinamento non è una prova di consenso.

**Limite operativo:** nel commit di riferimento F1-17 mancano le pagine per
accesso docente locale, abbinamento e dispositivi; la CI non pubblica ancora
installer/manifest nelle Release. Le prove tecniche non autorizzano l'impiego
con minori o dati reali. Vedere [guida](../operations/desktop-teacher-guide.md)
e [accettazione manuale](../operations/desktop-teacher-tests.md).

**Target PostgreSQL non consegnato:** ADR-0004 prevede un cluster PostgreSQL 15 locale, credenziali
SCRAM nel portachiavi e conversione/backup verificati. Le misure sotto restano quelle dei bundle
SQLite layout 1. Prima di un'attivazione reale occorre riesaminare questo allegato e i gate del
[contratto di upgrade](../operations/postgresql-desktop-upgrade.md); il target non riduce da solo i
rischi e non è ancora disponibile.

## Flussi e misure verificabili nel codice

| Tratto | Profilo docente-PC e limiti | Evidenza |
|---|---|---|
| Dispositivo → servizi | Backend e frontend su loopback, porte dinamiche, dati del proprio utente; SQLite locale, un solo backend worker | [guscio](../operations/desktop-teacher-shell.md), ADR-0002 |
| Identità docente | Sessione locale, link monouso tecnico; identità docente rifiutata dal tunnel; collegamento della GUI ancora assente | `backend/local_auth.py`, test locali |
| Studente → Cloudflare → PC | HTTPS pubblico e tunnel; Cloudflare termina TLS e può trattare traffico/metadati. Quick tunnel temporaneo, nominativo con hostname stabile | F1-09/F1-10, [piano](../architecture/desktop-apps-plan.md) |
| Abbinamento | Pseudonimo, codice classe a scadenza, codice personale, sessione e possibile approvazione; hash dei codici nel DB. Pseudonimizzazione, non anonimato | `backend/local_pairing.py` |
| PC → AI e servizi | Il gateway P6 filtra il testo esterno e blocca immagini/audio esterni; in `transitional` finalità, grant ed eventi non bloccano tutte le uscite. «Modello locale» richiede host fidato | [P6](p6-gateway.md), [P6a-c](p6ac-network-egress.md) |
| Docente → dati studente | P7 usa grant per classe, periodo e categorie, esclude il taccuino dal grant predefinito. La vista tecnica pseudonimizzata/break-glass L1 non va attribuita automaticamente al docente-admin L2 | [P7](p7-autorizzazioni.md), `backend/tests/test_teacher_profile.py` |
| Dati a riposo | SQLite, allegati, memorie, indici, backup e credenziali locali nella cartella utente. P11 è facoltativo (`PRIVACY_DB_ENCRYPTION=on`), non cifra tutto né converte lo storico | [P11](p11-cifratura-db.md) |
| Segreti | Chiavi provider nel portachiavi OS e ambiente del solo backend; token Cloudflare su file locale/configurazione. Voci Privacy KEK riservate: nessuna attivazione/custodia automatica completa | [chiavi API](../operations/desktop-api-keys.md), `datadir.rs` |
| Diagnostica e log | Redazione fail-closed; ZIP offline senza DB, credenziali e testo libero. Log locali e copie storiche richiedono comunque conservazione e controllo | [P13](p13-logs-diagnostica.md) |
| Backup e disponibilità | Snapshot SQLite prima dell'update, integrità verificata, conservazione degli ultimi sette; file/chiavi separati. App, PC e rete devono restare disponibili | [backup](../operations/sqlite-backups.md), F1-14/F1-16 |

Dopo l'integrazione P9, il backend conserva scelte e revoche versionate e le
rilegge per i grant del taccuino. Le finalità iniziali restano `undefined`/inattive,
i documenti non sono pubblicati automaticamente e manca la UI P10: occorrono
configurazione del Titolare e testi approvati **[DA VALIDARE]**. Le osservazioni dei
vecchi moduli non abilitano finalità. Riferimento: [P9](p9-consensi.md).

P12 aggiunge tre DEK separate per le credenziali persistite del backend, con
`PRIVACY_CREDENTIAL_ENCRYPTION=on` e KEK predisposta: il default resta Fernet.
Non sostituisce il portachiavi OS delle chiavi provider del pannello desktop.
Prima di attivarlo occorrono custodia e recupero verificati **[DA VALIDARE]**;
conservare le vecchie chiavi finché servono righe o backup legacy. Vedere [P12](p12-chiavi-fernet.md).

Telegram, OpenCode, Prompt Lab, helper ChatGPT, Piper e Console sync sono esclusi
da `teacher-pc`. Non includerli come servizi attivi nella descrizione L2.
Un modello locale non esclude altre uscite (Cloudflare, Edge TTS, provider scelti).
Non dichiarare che tutti i dati restano sul PC o che il DB è interamente cifrato.

## Registro dei rischi specifici L2

Integrare le righe R1–R13 dello schema generale con queste voci. Per ogni riga
probabilità, gravità, misura scelta e rischio residuo sono **[DA VALIDARE]**.

| Rischio | Misura attuale / limite | Decisione richiesta [DA VALIDARE] |
|---|---|---|
| Furto PC o copia dei backup | Permessi utente; cifratura completa del disco non imposta dall'app; P11 parziale e spento per default | Cifratura disco, blocco schermo, custodia e accesso al PC; posizione delle copie, conservazione e cancellazione |
| Accesso pubblico non previsto | Sessione docente solo locale; link pubblico e codici non equivalgono all'identità reale | Chi può diffondere link/codici, approvazione studenti, gestione revoche e dispositivo perso |
| Trasmissione di dati personali alla AI | Gateway P6 in transizione, rilevamento imperfetto, possibili testi sensibili | Provider ammessi, minimizzazione, basi giuridiche, configurazione strict e requisiti prima dell'attivazione |
| Docente-admin con accesso al filesystem | P7 protegge le API; il proprietario del PC conserva controllo tecnico sul DB/file | Autorizzazioni organizzative, separazione account, responsabilità di custodia e assistenza |
| Token o chiavi sottratti | Portachiavi per le API, token tunnel anche su file/config; export del profilo comprende segreti locali | Accesso alle copie, rotazione/revoca, procedura senza consegna di segreti all'assistenza |
| Perdita di chiavi o rollback incompatibile | Backup DB verificato; allegati/chiavi separati, nessuna compatibilità retroattiva garantita | Custode e prova del recupero, copia coordinata con versione e chiavi, responsabile del ripristino |
| Interruzione della lezione | Inibizione idle macOS/Windows solo con servizi/tunnel attivi; Linux manuale; rete/alimentazione non garantite | Continuità, lavoro alternativo, contatti e responsabilità |
| Conservazione oltre il necessario | Retention snapshot numerica, non una politica completa dei dati scolastici | Tempi per ciascuna categoria, fine anno/uscita classe, diritti e cancellazione da copie |

Per l'incidente usare la [bozza data breach](bozze/07-procedura-data-breach.md);
per conservazione e diritti la [bozza 06](bozze/06-politica-conservazione-cancellazione.md).
Nominativi dei responsabili, date, prove di ripristino, parere DPO e decisione
finale vanno registrati nelle sezioni 5–6 dello schema generale **[DA VALIDARE]**.
Riesaminare il documento quando cambiano provider, tunnel, versione, cifratura,
accessi o titolarità del PC. Non riportare segreti o dati di studenti nella DPIA.
