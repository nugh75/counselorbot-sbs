# Avvisi al primo uso di Taccuino e counselor

`AccountSetup` mostra una nota informativa prima delle schede nella prima scelta
del counselor e prima del modulo nel primo invito al Taccuino. Riutilizza
`counselor_ready` e `notebook_ready`; non aggiunge stato o finestre, non cambia
salvataggi, obbligatorietà, completamento o compatibilità. Le successive scelte
del counselor già disponibile non ripetono la nota.

Gli accessi sono quelli reali di `Header`, `HeaderCounselor` e `PersonalAreaHome`:

| Lingua | Ingresso personale | Taccuino | Menu |
| --- | --- | --- | --- |
| Italiano | Area studente | Taccuino | Menu |
| English | Student area | Notebook | Menu |
| Español | Área del estudiante | Cuaderno | Menú |
| Français | Espace élève | Carnet | Menu |
| Deutsch | Bereich für Lernende | Notizbuch | Menü |
| Svenska | Elevområde | Anteckningsbok | Meny |

Il nome del counselor apre la scelta: nella barra da 1280 px, nel Menu sotto
questa soglia. L'ingresso personale è nella barra da 1024 px (icona con
etichetta accessibile e tooltip), nel Menu sotto questa soglia; da lì la voce
Taccuino apre `/profilo/taccuino`. I testi delle note seguono i due breakpoint
distinti. La guida dell'interfaccia, sezione counselor, descrive gli stessi accessi
in tutte le sei lingue.

## Verifica isolata

Avvio e arresto: [live-dev-environment.md](live-dev-environment.md), sezione S2.
Il test `frontend/tests/account-onboarding.test.mjs` usa Chromium e API sintetiche
su `127.0.0.1:3147`, senza DB o chiamate AI. Copre le sei lingue a 390/1440 px,
le soglie 1023/1024/1279/1280 px e il flusso personale condiviso da docente,
ricercatore e amministratore. Verifica testo prima di conferma/compilazione,
salvataggio esplicito, riapertura e modifica Taccuino, cambio counselor dagli
accessi descritti e assenza di nuove note dopo il completamento. Le prove
esistenti coprono inoltre compatibilità, errori, ripresa e conservazione bozze.
Screenshot sintetici: `/tmp/first-use-{counselor,notebook}-<lingua>-<larghezza>.png`.

La verifica riguarda l'interfaccia reale con risposte API simulate; non prova
la persistenza su PostgreSQL o i provider AI, che non sono modificati.
Nessun merge, deploy o intervento sui container di produzione.

## Esito del 14 ottobre 2026

- Passati i 20 casi nuovi: sei lingue desktop/mobile, quattro soglie, tre ruoli
  condivisi e primo counselor con Taccuino già disponibile.
- Passate le prime 11 regressioni esistenti: onboarding, compatibilità, errori,
  sessioni riprese e conservazione delle bozze. La suite più ampia è stata
  interrotta dopo cinque errori fuori scope: due attese delle immagini della
  presentazione e tre selettori che cercano un heading QSA, mentre il catalogo
  attuale usa uno span. Nessuno di questi componenti o asset è modificato qui.
- Passati 430 test unitari, TypeScript, controllo i18n nelle sei lingue, lint dei
  file modificati e controlli della documentazione/diff.
- Il lint completo trova cinque errori e 50 warning preesistenti in altri file.

Bug salvati localmente nel Diario, senza issue GitHub pubblicate:
`50db1e7c-31a4-4ee4-8097-e5490efc74e1` (lint),
`696f4962-9c9e-45d2-a25e-b0e5a651414a` (selettori QSA),
`0bc22127-c022-4598-a35e-f2df000730ea` (WebP locale). L'ultimo è riprodotto con
richiesta WebP in timeout a 30 secondi, mentre il PNG equivalente risponde 200;
la causa e il comportamento in produzione non sono verificati.

Revisione indipendente esclusa dalla deroga esplicita dell'utente del 13 ottobre:
T2 Codex gpt-6.1-sol high, senza revisore, solo per questo task/PR.
