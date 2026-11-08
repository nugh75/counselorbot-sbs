# S1 — Salute dei prompt

## Stato
- Agente s1-prompt-health; task Diario 80b9b6f3-9580-421f-816f-e792224ce133.
- Worktree dedicato; branch feature/prompt-health-management, partito allineato a origin/main.
- Implementazione e verifiche complete; preparazione commit separati, push e PR senza merge.

## Fatto
- Scope approvato: problemi prima degli strumenti; modifica del prompt o del codice.
- Problemi espandibili per gravità, conteggio unico, filtri e nomi leggibili nelle sei lingue.
- Origine delle frasi distinta dalla proprietà di fabbrica; confronto sulle frasi coinvolte.
- Riepilogo copiabile per un agente con citazioni, turno e riferimenti del registro.
- Mappa, modello e uso reale espandibili; note, ripristino e ricontrollo conservati.
- Corrette le contraddizioni codice/codice nascoste e il consumer errato delle regole codice.
- Evidenze del codice invalidate al cambio della richiesta, senza chiamare il modello.
- Aggiornati guida prodotto, CONTEXT, HANDOFF e procedura fixture su 3186.

## Verifiche
- Backend: 34 test passati (health, health_llm, registry), PostgreSQL S1 senza rete e modello simulato.
- Frontend: 16 unitari e 5 browser verdi; desktop/mobile, scuro, inglese, copia e ripiego manuale.
- TypeScript, lint mirato, i18n (3867 chiavi, 6 lingue), guidance e diff --check verdi.
- Immagini dedicate backend Python 3.12 e frontend dev ricostruite; screenshot sintetici verificati.
- Npm locale completato; tentativi parziali conservati nella .tmp ignorata del worktree.

## Prossimi passi
- Commit backend e UI separati; push, PR sulla board CounselorBot e notifica immediata.
- Aggiornare questo handoff con la PR; chiudere il task Diario solo dopo il completamento.

## Blocchi e rischi
- Nessun accesso a produzione, dati reali, segreti, .env, sudo, deploy o rilascio desktop.
- Bug LOCAL confermati: 6fabbcce-110e-4971-907f-1f3b66028897 (codice/codice),
  2e5a5441-a078-4cb3-8f95-0a8ae4e165e4 (consumer); sync not-linked, nessuna issue creata a mano.
- Fuori scope: default Docker Python 3.10 incompatibile con datetime.UTC; bug LOCAL
  efc2ea65-2cb3-4502-9511-999bb8d7a87b confermato. Per i test usato build arg Python 3.12.
- Container S1 frontend su 127.0.0.1:3186 e PostgreSQL di test da fermare prima della consegna.

## Bug non registrati
- Nessuno; i tentativi con task già associato sono stati ripetuti senza quel collegamento.
