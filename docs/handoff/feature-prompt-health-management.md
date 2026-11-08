# S1 — Salute dei prompt: riferimenti al codice

## Stato
- Branch feature/prompt-health-code-references da origin/main 7a1dd0e0; worktree dedicato.
- Seguito autorizzato dal proprietario: codice chiaramente distinto dai prompt, file/funzione/riga visibili.
- PR #785 e registro deploy #786 già uniti; produzione al precedente deploy 1f12e776.
- Nessuna modifica alle regole del counseling: questo seguito aggiunge riferimenti e presentazione.
- Incluso anche il controllo LLM con abbonamento ChatGPT personale per amministratore (#788), commit separato.

## Fatto
- Localizzate le due citazioni dello screenshot: chat_logic.DEFAULT_NO_REASONING_DIRECTIVE
  e prompts/guided_choice_directive.md, caricato in prompt_config e usato da prompt_contract.turn_contract.
- Aggiunto indice locale dei letterali Python e dei Markdown di fabbrica, senza eseguire i costruttori.
- File/riga, funzione/costante e usi collegati aggiunti alle singole frasi anche in lettura da cache.
- Corrispondenze multiple e origini sconosciute esplicite: nessun file inventato, nessuna nuova chiamata AI.
- Badge CODICE DELL’APPLICAZIONE e riferimenti visibili sotto ogni citazione; inclusi nel riepilogo copiabile.
- Link al repository vincolati a file backend e righe positive; main distinto dalla versione installata.

## Verifiche
- Backend (Python 3.12, Postgres sintetico): 33 test verdi su source_locations, prompt_health e prompt_health_llm.
- Frontend: 18 unitari, 6 browser sintetici (:3186, API simulate), i18n, eslint verdi.
- tsc: solo errori preesistenti sui moduli .png (next-env.d.ts assente nel worktree); build production non eseguita.
- Guida funzionalità aggiornata; check-platform-guidance allineato.

## Prossimi passi
- PR aperta sulla board CounselorBot (issue #787 riferimenti, #788 abbonamento ChatGPT); merge al proprietario.
- Dopo il merge: deploy portable backend+frontend (--no-deps), nessun sudo necessario.

## Blocchi e rischi
- Solo repository e dati sintetici per questo seguito; nessun accesso ai dati o segreti della produzione.
- L’indice prova una corrispondenza letterale, non ricostruisce una traccia di chiamate del singolo turno.
- Le righe derivano dai sorgenti installati; GitHub apre il ramo main, che può avanzare.
- La correzione delle contraddizioni di contenuto resta separata, come le issue #775–#779 e il desktop.
- S1 iniziale concluso nel Diario (80b9b6f3-9580-421f-816f-e792224ce133); seguito in lavorazione.

## Bug non registrati
- Nessuno; la mancata localizzazione generica è lo scope di questa estensione, non un difetto riprodotto.
