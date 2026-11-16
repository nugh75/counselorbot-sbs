# Handoff — fix/ai-source-tooltip-1022 (#1022)

## Stato
Implementato; PR aperta.

## Fatto
Tooltip navbar in due righe («Gestito da: …», «Provider API · modello»), stringhe in 6 lingue, test e doc aggiornati.

## Verifiche
node --test ai-source.test.ts (3 ok); eslint pulito; tsc: solo errori preesistenti su immagini guide mancanti; make guidance-check ok. Nessuna verifica visiva (niente dev server).

## Prossimi passi
Merge da parte dell'utente; deploy solo frontend.

## Blocchi e rischi
Nessuno.
