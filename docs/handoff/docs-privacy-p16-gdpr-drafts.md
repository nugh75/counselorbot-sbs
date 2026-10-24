# Handoff — P16 bozze documentali GDPR

Agente `s68-p16-gdpr-drafts` (Claude Opus), task `8b3129bd-d608-4f0c-baa7-87354b95d7d0`, branch
`docs/privacy-p16-gdpr-drafts`, issue #572.

## Stato

Bozze 01-10 e `bozze/README.md` completate; README della privacy e `HANDOFF.md` aggiornati.

## Fatto

- Ripresa del lavoro di agy (Gemini): le 7 bozze presenti erano rivedute e riscritte con la stessa struttura. Motivo:
  descrivevano come attive misure non ancora in uso (grant P7, cifratura del taccuino P11, export e cancellazione
  self-service P14, `privacy_events`, ZDR contrattuale su tutti i provider, blocco art. 9) e fissavano scelte giuridiche
  (base art. 6(1)(e), soglia dei 14 anni) che 04 lascia al titolare.
- Fatto emerso dal codice: oggi il docente vede l'ultima versione del taccuino dei membri della classe
  (`backend/routes/groups.py:827`), senza consenso. Le bozze 01, 02, 04 lo dicono; il modulo 04 va usato solo dopo P7/P9/P10.
- `zdr`/`data_collection: deny` esistono solo per gli embedding via OpenRouter (`backend/embedding_service.py:107`).
- Nuove: 08 schema DPIA (13 rischi), 09 registro art. 30 (14 attività), 10 misure art. 32 (stato attiva/pronta/progettata).
- Tutti i dati di titolare/DPO, basi, termini e tempi di legge sono `[DA VALIDARE]` / `[DA COMPILARE DA PARTE DEL TITOLARE/DPO]`.

## Verifiche

- `make guidance-refresh`, `make guidance-check`: vedi PR. Nessun test applicativo: solo documentazione.

## Prossimi passi

- Revisione del titolare/DPO (P0). Aggiornare le bozze al rilascio di P6, P7, P9-P11, P14.

## Blocchi e rischi

- Riferimenti normativi non verificati sul testo ufficiale (04 §Fonti). Nessun bug nuovo registrato: G5 sul taccuino è già in 01 §9.
