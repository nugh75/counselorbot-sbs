# Dettaglio delle compilazioni per il docente — #406

## Audit e piano (21 ottobre 2026)

Base `d54d1807`, worktree e branch dedicati; #418 resta indipendente.
`StudentResultItem`, condiviso da Compilazioni, Classi e Piani di
somministrazione, espone solo punteggi compatti e transcript. Lo studente ha
anche profilo dei fattori, sintesi canonica, PDF e `ResultReading` (forze,
aree da sviluppare e nota). La lettura appartiene a username + sessione.

1. Aggiungere un dettaglio e un download PDF sotto gli accessi già esistenti
   della classe e del piano, identificando il risultato esatto. Nessuna nuova
   tabella, permesso di scrittura o modifica delle impostazioni produttive.
2. Riutilizzare sintesi e generatore PDF dello studente; tenere distinta la
   lettura scritta dallo studente dalla sintesi del counselor. Esplicitare le
   assenze, anche per strumenti qualitativi e risultati importati senza chat.
3. Un'unica scheda aperta su richiesta: risultati leggibili, sintesi, lettura,
   PDF e conversazione. Caricamento, errore e riprova; richieste annullate e
   dati smontati cambiando classe, studente, risultato o lingua.
4. Test HTTP su Postgres isolato per proprietario/collega/admin/estraneo,
   revoca, membro rimosso, piano errato e compilazioni multiple; test browser
   con/senza lettura, PDF, risposte tardive, sei lingue, desktop/mobile.
5. Aggiornare Markdown e guida docente, verificare build isolate senza
   riavviare produzione, commit/push e PR collegata a #406.

## Contratto implementato

- GET `/admin/groups/{group_id}/students/{username}/results/{result_id}`
  e lo stesso percorso con suffisso `/pdf`: ruolo plan-manager, classe
  visibile, membro attuale e risultato esatto appartenente a quel membro.
- GET `/admin/administration-plans/{plan_id}/students/{username}/results/{result_id}`
  e `/pdf`: piano visibile e risultato dello studente collegato proprio a quel
  piano. La sola iscrizione alla sua classe non espande l'accesso ai piani.
- Il dettaglio restituisce identità del risultato, punteggi, sintesi canonica,
  transcript e lettura dello studente per username/sessione/strumento. Non
  restituisce collegamenti a obiettivi personali. Nessuna scrittura della lettura.
- La sintesi riusa `canonical_summary`, con la cache e l'eventuale generazione
  già previste nella vista studente. Il PDF passa dallo stesso generatore e
  dagli stessi ingredienti della rotta privata dello studente; il vecchio URL
  dello studente conserva il controllo di proprietà. Il docente usa solo la
  nuova rotta autorizzata per classe o piano.
- «Apri compilazione» è comune a elenco Compilazioni, matrice ed elenco della
  classe e piani di somministrazione. La chiave include contesto, studente,
  risultato e lingua: cambiare scelta smonta richieste e download pendenti.
  Il client rifiuta anche un payload con identità diversa da quella richiesta.
- Lettura assente o vuota esplicita; campi mancanti indicati. La riflessione è
  testo dello studente, distinta dalla sintesi automatica e dai messaggi AI.
  Interfaccia e guida docente in sei lingue; informativa dei gruppi aggiornata.
- #247 resta il lavoro separato sul noticing: qui si usa la sintesi ordinaria
  dello studente, senza introdurre criticità, diagnosi o valutazioni del docente.

## Verifica isolata

Backend:

```sh
docker build -t counselorbot-teacher-results-validation:20261021 -f backend/Dockerfile .
docker run --rm -d --name counselorbot-406-postgres --network none \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=counselorbot_test mirror.gcr.io/library/postgres:15
# Attendere pg_isready nel container, quindi:
docker run --rm --network container:counselorbot-406-postgres \
  -e DATABASE_URL=postgresql://postgres@127.0.0.1:5432/counselorbot_test \
  -e PYTHON_DOTENV_DISABLED=1 -e COUNSELOR_TRANSLATE_DISABLED=1 -e ADMIN_SYNC_DISABLED=1 \
  counselorbot-teacher-results-validation:20261021 python -m pytest \
  backend/tests/test_teacher_result_detail.py backend/tests/test_teacher_class_compilations.py \
  backend/tests/test_pdf_summary.py -q --disable-warnings
docker stop counselorbot-406-postgres
```

36 test backend superati su Postgres 15 in tmpfs, senza rete esterna né volumi.
PDF reali estratti e confrontati in sei lingue; generazione LLM simulata.
Proprietario, collega, admin, ricercatore senza classe, altro docente e studente;
revoca, rimozione del membro, risultato/piano errato, compilazioni multiple,
lettura assente/vuota e sintesi non disponibile.

Frontend: runner `scripts/dev-teacher-class-compilations-tests.sh`, porta 3143
solo loopback, upstream non utilizzabile (`127.0.0.1:9`). Comando browser:

```sh
cd frontend
TEACHER_COMPILATIONS_BASE_URL=http://127.0.0.1:3143 node --test \
  --experimental-strip-types tests/teacher-class-compilations.test.mjs
```

Usato Node 26 per i test TS. API intercettate, traffico esterno bloccato,
nessun dato o modello di produzione. 600 unitari frontend superati. Le fixture
sono state aggiornate agli ingressi attuali `/docente/compilazioni` e
`/docente/classi/{id}?tab=students`, già presenti nella base.
Coperti 36 casi browser distinti con batterie parzialmente sovrapposte, inclusi
il cambio studente nella matrice e due compilazioni dello stesso questionario.
Alcune navigazioni a freddo hanno superato i timeout (30 e 60 s): ricontrollate
a compilazione conclusa con esito positivo. Il timeout di sola navigazione
della fixture è ora 60 s; restano 30 s per i controlli interattivi. Per riprodurre
su host sotto carico attendere la compilazione della pagina prima della batteria.
Le verifiche finali a 320/1440 px controllano anche il contenimento delle etichette
dei fattori nella scheda, oltre all’assenza di scorrimento orizzontale della pagina.

Per i font Google è stata usata la cache locale di CSS e file WOFF2 reali in
`/tmp/counselorbot-p6-font-cache`: `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` evita solo
il download. Nessun font fittizio e nessuna modifica al Dockerfile del progetto.
Il rebuild frontend usa una copia temporanea del Dockerfile con il mount di
questa cache e heap Node di 1536 MiB; le API della verifica sono disabilitate.
Dopo il merge ricostruire backend e frontend nel normale rilascio. Nessuna
migrazione DB, allineamento dei prompt o comando sudo richiesto da questa feature.

Rebuild backend e frontend completati con tag separati
`counselorbot-teacher-results-validation:20261021` e
`counselorbot-406-frontend-validation:20261021`. Il frontend ha completato
Webpack, TypeScript e generazione delle pagine; restano soltanto tre avvisi
`LegacyKeyValueFormat` già presenti nel Dockerfile. La compilazione nel Docker
Desktop condiviso ha richiesto circa 23 minuti. Nessuna immagine o servizio
produttivo sostituito durante questa verifica.

La batteria browser completa è stata poi rieseguita sull’immagine frontend
compilata, non sull’ambiente di sviluppo: `36/36` casi superati. Il compilato si
avvia con `docker run --rm --network none -p 127.0.0.1:3143:3000` (poi sola rete
`bridge` per servire la pagina) e `/docente/compilazioni` risponde `200`; i chunk
contengono i testi del dettaglio. Così la validazione copre anche l’artefatto
pronto al rilascio, non solo il sorgente con hot reload.
