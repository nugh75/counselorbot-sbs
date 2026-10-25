# F1-17 — s73-f1-17-docs

## Stato
PR aperta e push eseguito: https://github.com/nugh75/counselorbot-sbs/pull/584
Branch `docs/f1-17-desktop-docs-tests`, milestone installazione e board CounselorBot.
Base `2220ef99` = origin/main alla partenza; issue #213.
Task `a8f4b202-cc7b-42de-ae42-1eef04bdbc22`.

## Fatto
- Guida docente IT: bundle/sha256, pannello, tunnel, LLM, backup/rollback e problemi.
- DPIA L2 collegata a P16 e P6/P7/P11, con [DA VALIDARE]; checklist manuale.
- Lifecycle `--full`: lifespan reale, schema/seed/FK/integrità, health locale/pubblico.
- CI quattro OS in modalità completa; regressioni auth/pairing/profilo/backup Linux.
- F1-17 completato; F1-16 confermato; F1-15 packaging completo, Release ancora parziale.

## Verifiche
- Python 3.11.9 + TEST_DB=sqlite: 173 passati, nessun nuovo fallimento.
- Node: 14/14; Bash, YAML e link Markdown validi; diff senza whitespace errati.
- Commit `a4e3c821` test(desktop): controllore dati e lifecycle completo.
- Commit `110d6a7a` ci(desktop): lifecycle completo e regressioni.
- Commit `398d0d0c` test(desktop): health pubblico JSON del tunnel, Bash valido.
- Primo lancio Python 3.9 non supportato: ripetuto con ambiente corretto.
- Guida sei lingue/screenshot rivisti: nessun controllo web modificato.
- make guidance-refresh/check verdi; Platform guidance GitHub verde.
- Check nativi in corso: stato autorevole nella PR #584 (quattro runner).
- Commit docs `ff419ec6`; consegna registrata con questo aggiornamento finale.

## Prossimi passi
- Controllare esito CI dalla PR, poi revisione/merge del proprietario; nessun merge agente.
- Notifica PR accodata nel Diario: recipient_working; consegna non confermata.
  Canale mobile disattivato (NTFY_TOPIC assente).

## Blocchi e rischi
- Fase 1 aperta: UI docente/pairing/dispositivi e pubblicazione Release mancanti;
  portachiavi reali, tunnel nominativo e prove OS richiedono checklist manuale.
- Bug registrato LOCAL `302912bf-1be6-4bd7-85b4-bf22a7e65d00`, sospetto,
  sync not-linked; non è una issue GitHub. Nessun bug NOT_REGISTERED.
- Nessun Docker rebuild necessario (solo documenti/test/CI), deploy o dev avviato.
